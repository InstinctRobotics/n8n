import {
	ITriggerFunctions,
	ITriggerResponse,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import {
	OPCUAClient,
	AttributeIds,
	UserTokenType,
	DataChangeFilter,
	DataChangeTrigger,
	DeadbandType,
	TimestampsToReturn,
} from 'node-opcua';

export class OpcUaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OPC UA Trigger',
		name: 'opcUaTrigger',
		icon: 'file:opcua.svg',
		group: ['trigger'] as any,
		version: 1,
		description: 'Listens to OPC UA tag changes using subscriptions',
		defaults: {
			name: 'OPC UA Trigger',
		},
		triggerPanel: {
			header: '',
			executionsHelp: {
				inactive:
					"<b>While building your workflow</b>, click the 'execute step' button, then trigger a change on the OPC UA variable. This will trigger an execution in this editor.<br /> <br /><b>Once active</b>, the workflow will run automatically whenever a change matching the filters is detected.",
				active:
					"<b>While building your workflow</b>, click the 'execute step' button, then trigger a change on the OPC UA variable. This will trigger an execution in this editor.<br /> <br /><b>Your workflow is currently active</b> and will trigger executions automatically.",
			},
			activationHint:
				'Once you’ve finished building your workflow, publish/activate it to listen continuously.',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'opcUaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Node ID (Tag)',
				name: 'nodeId',
				type: 'string',
				default: 'ns=1;s=MyVariable',
				placeholder: 'ns=1;s=MyVariable',
				description: 'The Node ID / Tag identifier to subscribe to',
				required: true,
			},
			{
				displayName: 'Trigger',
				name: 'trigger',
				type: 'options',
				options: [
					{ name: 'Status Only', value: 'Status' },
					{ name: 'Status & Value', value: 'StatusValue' },
					{ name: 'Status, Value & Timestamp', value: 'StatusValueTimestamp' },
				],
				default: 'StatusValue',
				description: 'Select what should trigger the notification',
			},
			{
				displayName: 'Deadband Type',
				name: 'deadbandType',
				type: 'options',
				options: [
					{ name: 'None (Notify on Any Change)', value: 'None' },
					{ name: 'Absolute (Notify on Value Change > Threshold)', value: 'Absolute' },
					{ name: 'Percent (Notify on Value Change % of Range)', value: 'Percent' },
				],
				default: 'None',
				description: 'Deadband filter to ignore small fluctuations',
			},
			{
				displayName: 'Deadband Value',
				name: 'deadbandValue',
				type: 'number',
				displayOptions: {
					show: {
						deadbandType: ['Absolute', 'Percent'],
					},
				},
				default: 0.1,
				description: 'The threshold value for the deadband filter',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const nodeId = this.getNodeParameter('nodeId') as string;
		const triggerOption = this.getNodeParameter('trigger') as string;
		const deadbandTypeOption = this.getNodeParameter('deadbandType') as string;
		const deadbandValue = this.getNodeParameter('deadbandValue', 0.1) as number;

		const credentials = await this.getCredentials('opcUaApi');
		const endpointUrl = credentials.endpointUrl as string;
		const authentication = credentials.authentication as string;
		const username = credentials.username as string;
		const password = credentials.password as string;

		const client = OPCUAClient.create({
			endpointMustExist: false,
			connectionStrategy: {
				maxDelay: 2000,
				maxRetry: 2,
			},
		});

		try {
			await client.connect(endpointUrl);
		} catch (err: any) {
			throw new NodeOperationError(this.getNode(), `Failed to connect to OPC UA server: ${err.message}`);
		}

		let session: any;
		try {
			if (authentication === 'usernamePassword') {
				session = await client.createSession({
					type: UserTokenType.UserName,
					userName: username,
					password: password,
				});
			} else {
				session = await client.createSession();
			}
		} catch (err: any) {
			await client.disconnect();
			throw new NodeOperationError(this.getNode(), `Failed to create session on OPC UA server: ${err.message}`);
		}

		let subscription: any;
		let monitoredItem: any;

		// Resolve DataChangeTrigger
		let triggerType = DataChangeTrigger.StatusValue;
		if (triggerOption === 'Status') {
			triggerType = DataChangeTrigger.Status;
		} else if (triggerOption === 'StatusValueTimestamp') {
			triggerType = DataChangeTrigger.StatusValueTimestamp;
		}

		// Resolve DeadbandType
		let deadbandType = DeadbandType.None;
		if (deadbandTypeOption === 'Absolute') {
			deadbandType = DeadbandType.Absolute;
		} else if (deadbandTypeOption === 'Percent') {
			deadbandType = DeadbandType.Percent;
		}

		// Create the filter
		const filter = new DataChangeFilter({
			trigger: triggerType,
			deadbandType,
			deadbandValue,
		});

		const startSubscription = async (onChangedCallback: (dataValue: any) => void) => {
			subscription = await session.createSubscription2({
				requestedPublishingInterval: 500,
				requestedLifetimeCount: 100,
				requestedMaxKeepAliveCount: 20,
				maxNotificationsPerPublish: 10,
				publishingEnabled: true,
				priority: 10,
			});

			monitoredItem = await subscription.monitor(
				{
					nodeId: nodeId,
					attributeId: AttributeIds.Value,
				},
				{
					samplingInterval: 250,
					discardOldest: true,
					queueSize: 10,
					filter,
				},
				TimestampsToReturn.Both
			);

			monitoredItem.on('changed', onChangedCallback);
		};

		const emitEvent = (dataValue: any) => {
			this.emit([
				this.helpers.returnJsonArray([
					{
						nodeId,
						value: dataValue.value.value,
						dataType: dataValue.value.dataType?.toString() || 'Unknown',
						statusCode: dataValue.statusCode.toString(),
						sourceTimestamp: dataValue.sourceTimestamp,
						serverTimestamp: dataValue.serverTimestamp,
					},
				]),
			]);
		};

		const cleanup = async () => {
			try {
				if (monitoredItem) {
					await monitoredItem.terminate();
				}
				if (subscription) {
					await subscription.terminate();
				}
				if (session) {
					await session.close();
				}
				await client.disconnect();
			} catch (err) {
				// Suppress error during shutdown
			}
		};

		const manualTriggerFunction = async () =>
			await new Promise<void>(async (resolve, reject) => {
				try {
					await startSubscription((dataValue) => {
						emitEvent(dataValue);
						cleanup().then(resolve).catch(reject);
					});
				} catch (err: any) {
					cleanup().then(() => reject(err)).catch(() => reject(err));
				}
			});

		if (this.getMode() === 'trigger') {
			try {
				await startSubscription((dataValue) => {
					emitEvent(dataValue);
				});
			} catch (err: any) {
				await cleanup();
				throw new NodeOperationError(this.getNode(), `Failed to establish subscription: ${err.message}`);
			}
		}

		async function closeFunction() {
			await cleanup();
		}

		return {
			closeFunction,
			manualTriggerFunction,
		};
	}
}
