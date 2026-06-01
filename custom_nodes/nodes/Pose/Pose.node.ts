import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

const BASE_URL = 'http://host.docker.internal:8000/api/pose';

export class Pose implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Pose',
		name: 'pose',
		icon: 'fa:cube',
		group: ['robotics'] as any,
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manipulate 3D poses: chain, rotate, translate, distance, euler',
		defaults: {
			name: 'Pose',
		},
		inputs: '={{ ["chain", "distance"].includes($parameter.operation) ? ["main", "main"] : ["main"] }}' as any,
		outputs: ['main'],
		properties: [
			// ── Operation ────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Translate', value: 'translate' },
					{ name: 'Rotate', value: 'rotate' },
					{ name: 'Euler', value: 'euler' },
					{ name: 'Distance', value: 'distance' },
					{ name: 'Chain', value: 'chain' },
				],
				default: 'translate',
			},

			// ── Rotate Parameters ────────────────────────────────────────
			{
				displayName: 'Axis',
				name: 'axis',
				type: 'options',
				displayOptions: { show: { operation: ['rotate'] } },
				options: [
					{ name: 'X', value: 'x' },
					{ name: 'Y', value: 'y' },
					{ name: 'Z', value: 'z' },
					{ name: 'Custom', value: 'custom' },
				],
				default: 'z',
			},
			{
				displayName: 'Custom Axis',
				name: 'customAxis',
				type: 'string',
				displayOptions: {
					show: { operation: ['rotate'], axis: ['custom'] },
				},
				default: '[1, 0, 0]',
				description: 'Custom rotation axis as [x, y, z]',
			},
			{
				displayName: 'Angle',
				name: 'angle',
				type: 'number',
				displayOptions: { show: { operation: ['rotate'] } },
				default: 90,
			},
			{
				displayName: 'Degrees',
				name: 'degrees',
				type: 'boolean',
				displayOptions: { show: { operation: ['rotate', 'euler'] } },
				default: true,
			},
			{
				displayName: 'Rotation Frame',
				name: 'rotationFrame',
				type: 'string',
				displayOptions: { show: { operation: ['rotate'] } },
				default: '',
				description: 'Frame around which to rotate (empty = local pose frame)',
			},

			// ── Translate Parameters ─────────────────────────────────────
			{
				displayName: 'Translation [dx, dy, dz]',
				name: 'translation',
				type: 'string',
				displayOptions: { show: { operation: ['translate'] } },
				default: '[0, 0, 0.1]',
				description: 'Translation vector in meters',
			},
			{
				displayName: 'Frame',
				name: 'translationFrame',
				type: 'options',
				displayOptions: { show: { operation: ['translate'] } },
				options: [
					{ name: 'LOCAL', value: 'LOCAL' },
					{ name: 'PARENT', value: 'PARENT' },
				],
				default: 'LOCAL',
			},

			// ── Euler Parameters ─────────────────────────────────────────
			{
				displayName: 'Euler Sequence',
				name: 'eulerSequence',
				type: 'string',
				displayOptions: { show: { operation: ['euler'] } },
				default: 'xyz',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		if (!items || items.length === 0 || Object.keys(items[0].json).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'No input data received. Please disconnect and reconnect the input wire to this node.',
			);
		}

		let itemsB: INodeExecutionData[] = [];
		try {
			itemsB = this.getInputData(1);
		} catch (error) {
			// Second input is optional/unconnected
		}
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				// ── Get Pose A (Parent, from Input 1) ─────────────────
				const poseA = items[i].json as object;

				// ── Build request based on operation ─────────────────
				let url: string;
				let body: object;

				switch (operation) {
					case 'chain':
					case 'distance': {
						// ── Get Pose B (Child, from Input 2) ─────────────────
						const itemB = itemsB[i] || itemsB[0];
						if (!itemB) {
							throw new NodeOperationError(
								this.getNode(),
								`Second input (Child Pose from Vision) is required but not connected or empty`,
								{ itemIndex: i },
							);
						}
						const poseB = itemB.json as object;

						url = `${BASE_URL}/${operation}`;
						body = { pose_a: poseA, pose_b: poseB };
						break;
					}

					case 'rotate': {
						const axisParam = this.getNodeParameter('axis', i) as string;
						let axis: string | number[];
						if (axisParam === 'custom') {
							axis = JSON.parse(this.getNodeParameter('customAxis', i) as string);
						} else {
							axis = axisParam;
						}
						const angle = this.getNodeParameter('angle', i) as number;
						const degrees = this.getNodeParameter('degrees', i) as boolean;
						const frame = (this.getNodeParameter('rotationFrame', i, '') as string) || '';
						url = `${BASE_URL}/rotate`;
						body = { pose: poseA, axis, angle, degrees, frame };
						break;
					}

					case 'translate': {
						const translation = JSON.parse(
							this.getNodeParameter('translation', i) as string,
						);
						const frame = this.getNodeParameter('translationFrame', i) as string;
						url = `${BASE_URL}/translate`;
						body = { pose: poseA, translation, frame };
						break;
					}

					case 'euler': {
						const sequence = this.getNodeParameter('eulerSequence', i) as string;
						const degrees = this.getNodeParameter('degrees', i) as boolean;
						url = `${BASE_URL}/euler`;
						body = { pose: poseA, sequence, degrees };
						break;
					}

					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation: ${operation}`,
							{ itemIndex: i },
						);
				}

				const result = await this.helpers.httpRequest({
					method: 'POST',
					url,
					body,
					json: true,
				});

				returnData.push({ json: result });
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
