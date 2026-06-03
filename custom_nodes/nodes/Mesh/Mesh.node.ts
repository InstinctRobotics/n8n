import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Mesh implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mesh',
		name: 'mesh',
		icon: 'file:mesh.svg',
		group: ['robotics'] as any,
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Import, list and delete meshes in MoveIt',
		defaults: {
			name: 'Mesh',
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
						name: 'Import Mesh',
						value: 'import',
					},
					{
						name: 'Delete All Meshes',
						value: 'delete',
					},
					{
						name: 'Get Loaded Meshes',
						value: 'get',
					},
				],
				default: 'import',
			},
			{
				displayName: 'Object Name',
				name: 'objectName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['import'],
					},
				},
				default: 'bin',
				description: 'Il nome del file STL (senza .stl) da importare',
				required: true,
			},
			{
				displayName: 'Posa del Mesh',
				name: 'poseInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['import'],
					},
				},
				default: '{\n  "parent": "world",\n  "position": [0, 0, 0],\n  "orientation": [1, 0, 0, 0]\n}',
				description: 'Inserisci il JSON con parent, position e orientation della posa',
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

				if (operation === 'import') {
					const name = this.getNodeParameter('objectName', i) as string;
					const poseInputParam = this.getNodeParameter('poseInput', i);
					let pose: object;

					if (typeof poseInputParam === 'object' && poseInputParam !== null) {
						pose = poseInputParam;
					} else if (typeof poseInputParam === 'string' && poseInputParam.trim() !== '') {
						const trimmed = poseInputParam.trim();
						try {
							pose = JSON.parse(trimmed);
						} catch (e: any) {
							throw new Error(`Error in parsing input JSON for 'Mesh Pose' (received value: "${trimmed}"): ${e.message}`);
						}
					} else {
						// Fallback automatico dall'input del nodo
						const inputData = items[i].json as any;
						if (inputData.Pose && typeof inputData.Pose === 'object') {
							pose = inputData.Pose;
						} else if (inputData.position && inputData.orientation) {
							pose = inputData;
						} else {
							throw new Error(`Parameter 'Mesh Pose' is empty and no valid object has been found in input data.`);
						}
					}

					const body = {
						name,
						pose,
					};

					const result = await this.helpers.httpRequest({
						method: 'POST',
						url: 'http://host.docker.internal:8080/mesh',
						body,
						json: true,
					});
					returnData.push({ json: result });

				} else if (operation === 'delete') {
					const result = await this.helpers.httpRequest({
						method: 'DELETE',
						url: 'http://host.docker.internal:8080/mesh',
						json: true,
					});
					returnData.push({ json: result });

				} else if (operation === 'get') {
					const result = await this.helpers.httpRequest({
						method: 'GET',
						url: 'http://host.docker.internal:8080/mesh',
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
