import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Robot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Robot',
		name: 'robot',
		icon: 'fa:robot',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Controllo Robot (Move and Get Pose)',
		defaults: {
			name: 'Robot',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Move to Pose',
						value: 'move',
					},
					{
						name: 'Get Position',
						value: 'getPose',
					},
				],
				default: 'move',
			},
			{
				displayName: 'Posa del Robot',
				name: 'poseInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['move'],
					},
				},
				default: '{\n  "position": [0, 0, 0],\n  "orientation": [1, 0, 0, 0]\n}',
				description: 'Inserisci il JSON con position e orientation',
				required: true,
			},
			{
				displayName: 'Link Name',
				name: 'linkName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['getPose'],
					},
				},
				default: 'wrist_3_link',
				description: 'Il nome del link di cui ottenere la posa',
				required: true,
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'move') {
					const poseInputParam = this.getNodeParameter('poseInput', i);
					let body: object;
					if (typeof poseInputParam === 'object' && poseInputParam !== null) {
						body = poseInputParam;
					} else if (typeof poseInputParam === 'string' && poseInputParam.trim() !== '') {
						const trimmed = poseInputParam.trim();
						try {
							body = JSON.parse(trimmed);
						} catch (e: any) {
							throw new Error(`Error in parsing input JSON for 'Robot Pose' (received value: "${trimmed}"): ${e.message}`);
						}
					} else {
						// Fallback automatico dall'input del nodo
						const inputData = items[i].json as any;
						if (inputData.Robot && typeof inputData.Robot === 'object') {
							body = inputData.Robot;
						} else if (inputData.Pose && typeof inputData.Pose === 'object') {
							body = inputData.Pose;
						} else if (inputData.position && inputData.orientation) {
							body = inputData;
						} else {
							throw new Error(`Parameter 'Robot Pose' is empty and no valid object has been found ('Robot', 'Pose', or keys 'position'/'orientation') in input data.`);
						}
					}

					const result = await this.helpers.httpRequest({
						method: 'POST',
						url: 'http://host.docker.internal:8080/move_to_pose',
						body,
						json: true,
					});
					returnData.push({ json: result });

				} else if (operation === 'getPose') {
					const link = this.getNodeParameter('linkName', i) as string;
					const result = await this.helpers.httpRequest({
						method: 'GET',
						url: 'http://host.docker.internal:8080/get_pose',
						qs: {
							link,
						},
						json: true,
					});
					returnData.push({ json: result });
				}
			} catch (error: any) {
				const message = error.response?.data?.detail || error.message || String(error);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: message },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
