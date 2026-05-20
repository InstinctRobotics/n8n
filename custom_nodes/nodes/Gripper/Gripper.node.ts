import { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class Gripper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Gripper',
		name: 'gripper',
		icon: 'fa:hand',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Control robotic gripper (position and effort)',
		defaults: {
			name: 'Gripper',
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
						name: 'Control Gripper',
						value: 'control',
						routing: {
							request: {
								method: 'POST',
								url: 'http://host.docker.internal:8080/gripper',
								body: '={{$parameter["gripperInput"]}}',
							},
						},
					},
				],
				default: 'control',
			},
			{
				displayName: 'Gripper Input',
				name: 'gripperInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['control'],
					},
				},
				default: '{\n  "position": 0.0,\n  "effort": 50.0\n}',
				description: 'JSON with position (meters) and effort',
				required: true,
			},
		],
	};
}
