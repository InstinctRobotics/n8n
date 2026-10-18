import type { InstanceAiEvent } from '@n8n/api-types';
import type { Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { orchestratorAgentId, type RunStateRegistry } from '@n8n/instance-ai';
import { nanoid } from 'nanoid';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { InProcessEventBus } from './event-bus/in-process-event-bus';
import type { TypeORMAgentMemory } from './storage/typeorm-agent-memory';

/**
 * Alternative engine for the Instance AI assistant: the agent loop runs in Claude Code
 * (via the local `claude-server`), which uses n8n's own MCP server for its tools.
 * The UI is unchanged: this class only translates claude-server's SSE stream into the
 * same events the built-in engine publishes.
 *
 * Enabled with N8N_INSTANCE_AI_ENGINE=claude (see ClaudeEngine.isEnabled).
 */

const TOOL_PREFIX = 'mcp__n8n__';
const DESTRUCTIVE_TOOLS = new Set([
	'archive_workflow',
	'unpublish_workflow',
	'restore_workflow_version',
	'delete_data_table_column',
]);

const SYSTEM_PROMPT = `Sei l'assistente AI integrato nell'editor di n8n. Aiuti l'utente a creare, modificare, \
testare e capire i suoi workflow.

Lavori con gli strumenti MCP di n8n (prefisso mcp__n8n__). Per costruire o modificare un workflow:
1. Cerca i nodi adatti (search_workflow_nodes) e leggi i loro tipi (get_workflow_node_types).
2. Leggi il riferimento SDK (get_workflow_sdk_reference) e le best practice (get_workflow_best_practices) \
prima di scrivere il codice.
3. Valida il codice (validate_workflow_code) e poi crealo o aggiornalo (create_workflow_from_code / update_workflow).
4. Prova il risultato con test_workflow quando serve.
Usa list_credentials per scegliere le credenziali esistenti; non inventare ID.

Pubblicare, annullare la pubblicazione, eseguire, provare (test_workflow), archiviare o ripristinare una versione di un workflow richiede la conferma dell'utente: \
chiama comunque lo strumento, il sistema mostrerà all'utente la richiesta di conferma. Se l'utente nega, non insistere.
I workflow possono comandare un robot reale: prima di eseguire un workflow spiega brevemente cosa farà.

Rispondi nella lingua dell'utente, in modo conciso. Non mostrare il codice SDK completo nella risposta finale \
a meno che l'utente lo chieda: riassumi cosa hai creato e dove trovarlo.`;

interface ClaudeEngineDeps {
	eventBus: InProcessEventBus;
	runState: RunStateRegistry<User>;
	agentMemory: TypeORMAgentMemory;
	logger: Logger;
	/** Cartella dati di n8n, dove salviamo il collegamento thread → sessione Claude. */
	dataFolder: string;
}

interface RunArgs {
	user: User;
	threadId: string;
	runId: string;
	message: string;
	abortController: AbortController;
	messageGroupId?: string;
	timeZone?: string;
}

interface SseEvent {
	event: string;
	data: Record<string, unknown>;
}

export class ClaudeEngine {
	static isEnabled(): boolean {
		return process.env.N8N_INSTANCE_AI_ENGINE === 'claude';
	}

	private readonly baseUrl = (process.env.N8N_CLAUDE_SERVER_URL ?? 'http://127.0.0.1:8765').replace(
		/\/$/,
		'',
	);

	private readonly token = process.env.N8N_CLAUDE_SERVER_TOKEN ?? '';

	private readonly maxTurns = Number(process.env.N8N_CLAUDE_SERVER_MAX_TURNS ?? '40');

	private sessions?: Record<string, string>;

	/** Tools the user chose "Always allow" for, per thread (in memory: a restart asks again). */
	private readonly alwaysAllowed = new Map<string, Set<string>>();

	constructor(private readonly deps: ClaudeEngineDeps) {}

	private get sessionsFile() {
		return join(this.deps.dataFolder, 'claude-sessions.json');
	}

	private async getSessionId(threadId: string): Promise<string | undefined> {
		if (!this.sessions) {
			try {
				this.sessions = JSON.parse(await fs.readFile(this.sessionsFile, 'utf8')) as Record<
					string,
					string
				>;
			} catch {
				this.sessions = {};
			}
		}
		return this.sessions[threadId];
	}

	private async setSessionId(threadId: string, sessionId: string): Promise<void> {
		await this.getSessionId(threadId);
		this.sessions![threadId] = sessionId;
		try {
			await fs.writeFile(this.sessionsFile, JSON.stringify(this.sessions), { mode: 0o600 });
		} catch (error) {
			this.deps.logger.warn('Unable to persist Claude session map', { error: String(error) });
		}
	}

	private headers() {
		return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
	}

	/** Parses a Server-Sent Events stream into (event, data) pairs. */
	private async *readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
		const decoder = new TextDecoder();
		let buffer = '';
		for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
			buffer += decoder.decode(chunk, { stream: true });
			let idx: number;
			while ((idx = buffer.indexOf('\n\n')) >= 0) {
				const block = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 2);
				let event = 'message';
				let data = '';
				for (const line of block.split('\n')) {
					if (line.startsWith('event: ')) event = line.slice(7);
					else if (line.startsWith('data: ')) data += line.slice(6);
				}
				if (data) yield { event, data: JSON.parse(data) as Record<string, unknown> };
			}
		}
	}

	private async answerPermission(id: string, allow: boolean, message?: string) {
		try {
			const res = await fetch(`${this.baseUrl}/permissions/${id}`, {
				method: 'POST',
				headers: this.headers(),
				body: JSON.stringify({ allow, message }),
			});
			if (!res.ok) {
				this.deps.logger.warn('claude-server rejected the permission answer', {
					status: res.status,
				});
			}
		} catch (error) {
			this.deps.logger.warn('Unable to answer claude-server permission request', {
				error: String(error),
			});
		}
	}

	async run({
		user,
		threadId,
		runId,
		message,
		abortController,
		messageGroupId,
		timeZone,
	}: RunArgs): Promise<void> {
		const { eventBus, runState, agentMemory, logger } = this.deps;
		const agentId = orchestratorAgentId(runId);
		const base = { runId, agentId, userId: user.id };
		const publish = (event: Record<string, unknown>) =>
			eventBus.publish(threadId, { ...base, ...event } as InstanceAiEvent);

		const messageId = `msg_${nanoid()}`;
		let responseCounter = 0;
		let finalText = '';
		let status: 'completed' | 'cancelled' | 'error' = 'completed';
		const startedAt = new Date();

		publish({ type: 'run-start', payload: { messageId, messageGroupId } });

		try {
			await agentMemory.saveMessages({
				threadId,
				resourceId: user.id,
				messages: [
					{
						id: nanoid(),
						createdAt: startedAt,
						type: 'llm',
						role: 'user',
						content: [{ type: 'text', text: message }],
					},
				],
			});

			if (!this.token) throw new Error('N8N_CLAUDE_SERVER_TOKEN is not configured');

			const sessionId = await this.getSessionId(threadId);
			const response = await fetch(`${this.baseUrl}/ask/stream`, {
				method: 'POST',
				headers: this.headers(),
				signal: abortController.signal,
				body: JSON.stringify({
					prompt: timeZone ? `${message}\n\n<context>timezone: ${timeZone}</context>` : message,
					session_id: sessionId,
					system_prompt: SYSTEM_PROMPT,
					tools: [],
					max_turns: this.maxTurns,
				}),
			});
			if (!response.ok || !response.body) {
				throw new Error(`claude-server answered ${response.status}: ${await response.text()}`);
			}

			for await (const { event, data } of this.readSse(response.body)) {
				switch (event) {
					case 'session':
						await this.setSessionId(threadId, String(data.session_id));
						break;

					case 'text': {
						const text = String(data.text ?? '');
						if (!text) break;
						finalText += (finalText ? '\n\n' : '') + text;
						publish({
							type: 'text-delta',
							responseId: `claude:${runId}:${responseCounter++}`,
							payload: { text },
						});
						break;
					}

					case 'tool_use':
						publish({
							type: 'tool-call',
							responseId: `claude:${runId}:${responseCounter++}`,
							payload: {
								toolCallId: String(data.id),
								toolName: String(data.name).replace(TOOL_PREFIX, ''),
								args: (data.input ?? {}) as Record<string, unknown>,
							},
						});
						break;

					case 'tool_result': {
						const content = String(data.content ?? '');
						if (data.is_error) {
							publish({
								type: 'tool-error',
								payload: { toolCallId: String(data.id), error: content },
							});
						} else {
							let result: unknown = content;
							try {
								result = JSON.parse(content);
							} catch {
								// plain-text result
							}
							publish({ type: 'tool-result', payload: { toolCallId: String(data.id), result } });
						}
						break;
					}

					case 'permission_request': {
						const permissionId = String(data.id);
						const toolName = String(data.name).replace(TOOL_PREFIX, '');
						const requestId = `claude_${permissionId}`;
						void (async () => {
							if (this.alwaysAllowed.get(threadId)?.has(toolName)) {
								await this.answerPermission(permissionId, true);
								return;
							}
							const approved = await new Promise<boolean>((resolve) => {
								runState.registerPendingConfirmation(requestId, {
									resolve: (confirmation) => {
										if (confirmation.approved && confirmation.scope === 'session') {
											const allowed = this.alwaysAllowed.get(threadId) ?? new Set<string>();
											allowed.add(toolName);
											this.alwaysAllowed.set(threadId, allowed);
										}
										resolve(confirmation.approved);
									},
									threadId,
									userId: user.id,
									createdAt: Date.now(),
								});
								publish({
									type: 'confirmation-request',
									payload: {
										requestId,
										toolCallId: String(data.tool_use_id),
										toolName,
										args: (data.input ?? {}) as Record<string, unknown>,
										severity: DESTRUCTIVE_TOOLS.has(toolName) ? 'destructive' : 'warning',
										message: `Claude vuole eseguire "${toolName}". Consenti?`,
									},
								});
							});
							await this.answerPermission(
								permissionId,
								approved,
								approved ? undefined : "L'utente ha negato l'azione",
							);
						})();
						break;
					}

					case 'result':
						if (data.is_error) {
							status = 'error';
							publish({
								type: 'error',
								payload: { content: String(data.result ?? 'Claude Code reported an error') },
							});
						} else if (typeof data.result === 'string' && data.result && !finalText) {
							finalText = data.result;
							publish({
								type: 'text-delta',
								responseId: `claude:${runId}:${responseCounter++}`,
								payload: { text: data.result },
							});
						}
						if (typeof data.session_id === 'string') {
							await this.setSessionId(threadId, data.session_id);
						}
						break;

					case 'error':
						status = 'error';
						publish({ type: 'error', payload: { content: String(data.error) } });
						break;
				}
			}
		} catch (error) {
			if (abortController.signal.aborted) {
				status = 'cancelled';
			} else {
				status = 'error';
				logger.error('Claude engine run failed', { threadId, runId, error: String(error) });
				publish({
					type: 'error',
					payload: { content: `Claude engine: ${error instanceof Error ? error.message : error}` },
				});
			}
		} finally {
			// Anything still waiting for a confirmation is closed: the run is over.
			runState.cancelThread(threadId);
			if (finalText) {
				try {
					await agentMemory.saveMessages({
						threadId,
						resourceId: user.id,
						messages: [
							{
								id: messageId,
								createdAt: new Date(),
								type: 'llm',
								role: 'assistant',
								content: [{ type: 'text', text: finalText }],
							},
						],
					});
				} catch (error) {
					logger.warn('Unable to persist the assistant message', { error: String(error) });
				}
			}
			runState.clearActiveRun(threadId);
			publish({ type: 'run-finish', payload: { status } });
		}
	}
}
