import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import {
	OPCUAClient,
	AttributeIds,
	DataType,
	Variant,
	StatusCodes,
	UserTokenType,
	DataChangeFilter,
	DataChangeTrigger,
	DeadbandType,
	TimestampsToReturn,
} from 'node-opcua';

export class OpcUa implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OPC UA',
		name: 'opcUa',
		icon: 'file:opcua.svg',
		group: ['robotics'] as any,
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Read or write tags on an OPC UA server',
		defaults: {
			name: 'OPC UA',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'opcUaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Read',
						value: 'read',
						description: 'Read a specific tag',
					},
					{
						name: 'Write',
						value: 'write',
						description: 'Write to a specific tag',
					},
					{
						name: 'Call Method',
						value: 'call',
						description: 'Call a method on the OPC UA server',
					},
					{
						name: 'Wait for Change',
						value: 'wait',
						description: 'Wait until a tag value changes',
					},
				],
				default: 'read',
			},
			{
				displayName: 'Node ID (Tag)',
				name: 'nodeId',
				type: 'string',
				default: 'ns=1;s=MyVariable',
				placeholder: 'ns=1;s=MyVariable',
				description: 'The Node ID / Tag identifier to read, write, or wait for',
				required: true,
				displayOptions: {
					show: {
						operation: ['read', 'write', 'wait'],
					},
				},
			},
			{
				displayName: 'Trigger',
				name: 'trigger',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['wait'],
					},
				},
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
				displayOptions: {
					show: {
						operation: ['wait'],
					},
				},
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
						operation: ['wait'],
						deadbandType: ['Absolute', 'Percent'],
					},
				},
				default: 0.1,
				description: 'The threshold value for the deadband filter',
			},
			{
				displayName: 'Timeout (ms)',
				name: 'timeout',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['wait'],
					},
				},
				default: 0,
				description: 'Timeout in milliseconds. Set to 0 to wait indefinitely.',
			},
			{
				displayName: 'Method Node ID',
				name: 'methodId',
				type: 'string',
				default: 'ns=1;s=MyMethod',
				placeholder: 'ns=1;s=MyMethod',
				description: 'The Node ID of the method to call',
				required: true,
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
			},
			{
				displayName: 'Object Node ID',
				name: 'objectId',
				type: 'string',
				default: 'ns=1;i=85',
				placeholder: 'ns=1;i=85',
				description: 'The Node ID of the object containing the method',
				required: true,
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
			},
			{
				displayName: 'Input Arguments',
				name: 'inputArguments',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
				placeholder: 'Add Argument',
				default: {},
				options: [
					{
						name: 'arguments',
						displayName: 'Arguments',
						values: [
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{ name: 'Boolean', value: 'Boolean' },
									{ name: 'Double', value: 'Double' },
									{ name: 'Float', value: 'Float' },
									{ name: 'Int32', value: 'Int32' },
									{ name: 'String', value: 'String' },
								],
								default: 'String',
								description: 'Type of the input argument',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Value of the input argument',
							},
						],
					},
				],
			},
			{
				displayName: 'Value to Write',
				name: 'valueToWrite',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['write'],
					},
				},
				default: '',
				description: 'The value to write to the node',
				required: true,
			},
			{
				displayName: 'Data Type',
				name: 'dataType',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['write'],
					},
				},
				options: [
					{ name: 'Auto Detect', value: 'auto' },
					{ name: 'Boolean', value: 'Boolean' },
					{ name: 'Double', value: 'Double' },
					{ name: 'Float', value: 'Float' },
					{ name: 'Int32', value: 'Int32' },
					{ name: 'String', value: 'String' },
				],
				default: 'auto',
				description: 'Explicit data type to use when writing the value',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('opcUaApi');
		const endpointUrl = credentials.endpointUrl as string;
		const authentication = credentials.authentication as string;
		const username = credentials.username as string;
		const password = credentials.password as string;

		const client = OPCUAClient.create({
			endpointMustExist: false,
			connectionStrategy: {
				maxDelay: 2000,
				maxRetry: 1,
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

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'read') {
					const nodeId = this.getNodeParameter('nodeId', i) as string;
					const dataValue = await session.read({
						nodeId: nodeId,
						attributeId: AttributeIds.Value,
					});

					if (dataValue.statusCode.value !== StatusCodes.Good.value) {
						throw new Error(`Read failed with status code ${dataValue.statusCode.toString()}`);
					}

					returnData.push({
						json: {
							nodeId,
							value: dataValue.value.value,
							dataType: DataType[dataValue.value.dataType],
							statusCode: dataValue.statusCode.toString(),
							sourceTimestamp: dataValue.sourceTimestamp,
							serverTimestamp: dataValue.serverTimestamp,
						},
					});
				} else if (operation === 'write') {
					const nodeId = this.getNodeParameter('nodeId', i) as string;
					const rawValue = this.getNodeParameter('valueToWrite', i) as string;
					const dataTypeOption = this.getNodeParameter('dataType', i) as string;

					let valueToUse: any = rawValue;
					let inferredType = DataType.String;

					if (dataTypeOption === 'auto') {
						if (rawValue.toLowerCase() === 'true') {
							valueToUse = true;
							inferredType = DataType.Boolean;
						} else if (rawValue.toLowerCase() === 'false') {
							valueToUse = false;
							inferredType = DataType.Boolean;
						} else if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') {
							valueToUse = Number(rawValue);
							inferredType = Number.isInteger(valueToUse) ? DataType.Int32 : DataType.Double;
						} else {
							valueToUse = rawValue;
							inferredType = DataType.String;
						}
					} else {
						// Explicit cast
						inferredType = (DataType as any)[dataTypeOption];
						if (dataTypeOption === 'Boolean') {
							valueToUse = rawValue.toLowerCase() === 'true' || rawValue === '1';
						} else if (dataTypeOption === 'Double' || dataTypeOption === 'Float' || dataTypeOption === 'Int32') {
							valueToUse = Number(rawValue);
							if (isNaN(valueToUse)) {
								throw new Error(`Value "${rawValue}" cannot be converted to ${dataTypeOption}`);
							}
						}
					}

					const writeResult = await session.write({
						nodeId: nodeId,
						attributeId: AttributeIds.Value,
						value: new Variant({
							dataType: inferredType,
							value: valueToUse,
						}),
					});

					if (writeResult.value !== StatusCodes.Good.value) {
						throw new Error(`Write failed with status code ${writeResult.toString()}`);
					}

					returnData.push({
						json: {
							nodeId,
							success: true,
							statusCode: writeResult.toString(),
						},
					});
				} else if (operation === 'call') {
					const objectId = this.getNodeParameter('objectId', i) as string;
					const methodId = this.getNodeParameter('methodId', i) as string;
					const inputArgsRaw = this.getNodeParameter('inputArguments.arguments', i, []) as Array<{ type: string, value: string }>;

					const inputArguments = inputArgsRaw.map(arg => {
						const dataType = (DataType as any)[arg.type];
						let valueToUse: any = arg.value;
						if (arg.type === 'Boolean') {
							valueToUse = arg.value.toLowerCase() === 'true' || arg.value === '1';
						} else if (arg.type === 'Double' || arg.type === 'Float' || arg.type === 'Int32') {
							valueToUse = Number(arg.value);
							if (isNaN(valueToUse)) {
								throw new Error(`Argument value "${arg.value}" cannot be converted to ${arg.type}`);
							}
						}
						return new Variant({
							dataType: dataType,
							value: valueToUse,
						});
					});

					const callResult = await session.call({
						objectId,
						methodId,
						inputArguments,
					});

					if (callResult.statusCode.value !== StatusCodes.Good.value) {
						throw new Error(`Call failed with status code ${callResult.statusCode.toString()}`);
					}

					returnData.push({
						json: {
							objectId,
							methodId,
							success: true,
							statusCode: callResult.statusCode.toString(),
							outputArguments: callResult.outputArguments?.map((val: any) => ({
								value: val.value,
								dataType: DataType[val.dataType],
							})) || [],
						},
					});
				} else if (operation === 'wait') {
					const nodeId = this.getNodeParameter('nodeId', i) as string;
					const triggerOption = this.getNodeParameter('trigger', i) as string;
					const deadbandTypeOption = this.getNodeParameter('deadbandType', i) as string;
					const deadbandValue = this.getNodeParameter('deadbandValue', i, 0.1) as number;
					const timeout = this.getNodeParameter('timeout', i, 0) as number;

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

					const filter = new DataChangeFilter({
						trigger: triggerType,
						deadbandType,
						deadbandValue,
					});

					const subscription = await session.createSubscription2({
						requestedPublishingInterval: 500,
						requestedLifetimeCount: 100,
						requestedMaxKeepAliveCount: 20,
						maxNotificationsPerPublish: 10,
						publishingEnabled: true,
						priority: 10,
					});

					const monitoredItem = await subscription.monitor(
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

					// Wait for the first change or timeout
					const changePromise = new Promise<{ dataValue: any; isTimeout: boolean }>((resolve) => {
						let timeoutId: any = null;

						const onChanged = (dataValue: any) => {
							if (timeoutId) clearTimeout(timeoutId);
							resolve({ dataValue, isTimeout: false });
						};

						monitoredItem.once('changed', onChanged);

						if (timeout > 0) {
							timeoutId = setTimeout(() => {
								monitoredItem.removeListener('changed', onChanged);
								resolve({ dataValue: null, isTimeout: true });
							}, timeout);
						}
					});

					const { dataValue, isTimeout } = await changePromise;

					// Cleanup subscription
					try {
						await monitoredItem.terminate();
						await subscription.terminate();
					} catch {}

					if (isTimeout) {
						throw new Error(`Wait timed out after ${timeout} ms`);
					}

					returnData.push({
						json: {
							nodeId,
							value: dataValue.value.value,
							dataType: dataValue.value.dataType?.toString() || 'Unknown',
							statusCode: dataValue.statusCode.toString(),
							sourceTimestamp: dataValue.sourceTimestamp,
							serverTimestamp: dataValue.serverTimestamp,
						},
					});
				}
			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message || String(error) },
					});
					continue;
				}
				try {
					await session.close();
					await client.disconnect();
				} catch {}
				throw new NodeOperationError(this.getNode(), error.message || String(error), { itemIndex: i });
			}
		}

		try {
			await session.close();
			await client.disconnect();
		} catch {}

		return [returnData];
	}
}
