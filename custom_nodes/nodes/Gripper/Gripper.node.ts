import { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class Gripper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Gripper',
		name: 'gripper',
		icon: 'file:gripper.svg',
		group: ['robotics'] as any,
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
								body: {
									position: '={{$parameter["position"]}}',
									effort: '={{$parameter["effort"]}}',
									position_tolerance: '={{$parameter["positionTolerance"]}}',
								},
								headers: {
									'Content-Type': 'application/json',
								},
							},
						},
					},
				],
				default: 'control',
			},
			{
				displayName: 'Position (m)',
				name: 'position',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['control'],
					},
				},
				default: 0.0,
				description: 'Target position in meters (e.g., 0.0 = closed, 0.085 = open)',
				required: true,
			},
			{
				displayName: 'Effort (N)',
				name: 'effort',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['control'],
					},
				},
				default: 0.0,
				description: 'Maximum effort in Newtons. If the gripper stalls, the command succeeds if the measured effort is greater than or equal to this threshold and the final position is within the tolerance.',
				required: true,
			},
			{
				displayName: 'Position Tolerance (m)',
				name: 'positionTolerance',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['control'],
					},
				},
				default: 0.002,
				description: 'Allowed tolerance in meters compared to the requested position. If the final position is within this range and the effort condition is met, the grasp is considered successful.',
				required: true,
			},
		],
	};
}
