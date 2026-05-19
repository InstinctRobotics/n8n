import { INodeType, INodeTypeDescription } from 'n8n-workflow';

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
						routing: {
							request: {
								method: 'POST',
								url: 'http://host.docker.internal:8080/move_to_pose',
								body: '={{$parameter["poseInput"]}}',
							},
						},
					},
					{
						name: 'Get Position',
						value: 'getPose',
						routing: {
							request: {
								method: 'GET',
								url: 'http://host.docker.internal:8080/get_pose',
								qs: {
									link: '={{$parameter["linkName"]}}',
								},
							},
						},
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
}
