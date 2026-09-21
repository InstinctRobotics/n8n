import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import os from 'node:os';

export interface CustomNodeDoc {
	nodeNames: string[];
	title: string;
	roleSummary: string;
	content: string;
	filePath: string;
}

/**
 * Returns candidate directories where custom extensions can be installed.
 */
export function getCustomExtensionDirectories(): string[] {
	const dirs: string[] = [];
	const envDirs = process.env.N8N_CUSTOM_EXTENSIONS;
	if (envDirs) {
		for (const d of envDirs.split(/[:;,]/)) {
			const trimmed = d.trim();
			if (trimmed && existsSync(trimmed) && !dirs.includes(trimmed)) {
				dirs.push(trimmed);
			}
		}
	}

	const userFolder = process.env.N8N_USER_FOLDER || os.homedir();
	const defaultCustomDir = join(userFolder, '.n8n', 'custom');
	if (existsSync(defaultCustomDir) && !dirs.includes(defaultCustomDir)) {
		dirs.push(defaultCustomDir);
	}

	return dirs;
}

/**
 * Recursively find all AI.md files within a directory up to maxDepth.
 */
function findAiMdFiles(dir: string, currentDepth = 0, maxDepth = 4): string[] {
	if (currentDepth > maxDepth || !existsSync(dir)) return [];
	const results: string[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				results.push(...findAiMdFiles(fullPath, currentDepth + 1, maxDepth));
			} else if (entry.isFile() && entry.name.toLowerCase() === 'ai.md') {
				results.push(fullPath);
			}
		}
	} catch {
		// Ignore unreadable directories
	}
	return results;
}

/**
 * Parse an AI.md file to extract node names, title, role summary, and content.
 */
export function parseCustomNodeDoc(filePath: string): CustomNodeDoc | null {
	try {
		const content = readFileSync(filePath, 'utf-8');
		const lines = content.split('\n');

		let title = '';
		let roleSummary = '';
		const nodeNames: string[] = [];

		// Find title and extract node names only from the heading line
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('# ')) {
				title = trimmed.replace(/^#\s*/, '').trim();
				const headingMatches = [...title.matchAll(/`?CUSTOM\.([a-zA-Z0-9_-]+)`?/gi)];
				for (const m of headingMatches) {
					const name = `CUSTOM.${m[1]}`;
					if (!nodeNames.includes(name)) nodeNames.push(name);
				}
				break;
			}
		}

		if (nodeNames.length === 0) {
			const parentDir = basename(dirname(filePath));
			nodeNames.push(`CUSTOM.${parentDir.charAt(0).toLowerCase() + parentDir.slice(1)}`);
		}

		// Find Role & Purpose or first descriptive paragraph
		let inRoleSection = false;
		for (const line of lines) {
			const trimmed = line.trim();
			if (
				trimmed.toLowerCase().includes('## role') ||
				trimmed.toLowerCase().includes('## purpose')
			) {
				inRoleSection = true;
				continue;
			}
			if (inRoleSection) {
				if (trimmed.startsWith('##')) break;
				if (trimmed.length > 0) {
					roleSummary = trimmed;
					break;
				}
			}
		}

		if (!roleSummary) {
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith('#')) {
					roleSummary = trimmed;
					break;
				}
			}
		}

		return {
			nodeNames,
			title: title || nodeNames.join(', '),
			roleSummary: roleSummary || title,
			content,
			filePath,
		};
	} catch {
		return null;
	}
}

let cachedDocs: CustomNodeDoc[] | null = null;
let lastCacheCheck = 0;
const CACHE_TTL_MS = 10000;

export function discoverCustomNodeDocs(forceRefresh = false): CustomNodeDoc[] {
	const now = Date.now();
	if (!forceRefresh && cachedDocs !== null && now - lastCacheCheck < CACHE_TTL_MS) {
		return cachedDocs;
	}

	const dirs = getCustomExtensionDirectories();
	const docs: CustomNodeDoc[] = [];
	const seenPaths = new Set<string>();

	for (const d of dirs) {
		const files = findAiMdFiles(d);
		for (const f of files) {
			if (seenPaths.has(f)) continue;
			seenPaths.add(f);
			const doc = parseCustomNodeDoc(f);
			if (doc) docs.push(doc);
		}
	}

	cachedDocs = docs;
	lastCacheCheck = now;
	return docs;
}

export function getCustomNodesSystemPromptSection(workspaceRoot?: string): string {
	const docs = discoverCustomNodeDocs();
	if (docs.length === 0) return '';

	const lines = [
		'## Custom Nodes & Extensions',
		'',
		'The following custom nodes are registered and available in this n8n instance:',
	];

	for (const doc of docs) {
		const nodeLabel = doc.nodeNames.map((n) => `\`${n}\``).join(' / ');
		lines.push(`- ${nodeLabel}: ${doc.roleSummary}`);
	}

	lines.push('');
	const refPath = workspaceRoot
		? `${workspaceRoot}/knowledge-base/reference/custom-nodes.md`
		: '${N8N_WORKSPACE_DIR}/knowledge-base/reference/custom-nodes.md';

	lines.push(
		`IMPORTANT: When the user asks for robotics, robot arms, grippers, computer vision, 3D pointclouds, meshes, or OPC UA/PLC, prioritize using these custom nodes. Full specifications, operations, schemas, and workflow connection patterns are documented in the knowledge base at \`${refPath}\` and accessible via the \`nodes\` tool.`,
	);

	return lines.join('\n');
}

export function getCustomNodesKnowledgeBaseDoc(): string {
	const docs = discoverCustomNodeDocs();
	if (docs.length === 0) return '';

	const parts = [
		'# Custom Nodes Documentation & Guidelines',
		'',
		'This reference contains detailed specifications, operations, input/output schemas, and connection patterns for all custom nodes installed on this n8n instance.',
		'',
	];

	for (const doc of docs) {
		parts.push('---');
		parts.push('');
		parts.push(doc.content.trim());
		parts.push('');
	}

	return parts.join('\n');
}
