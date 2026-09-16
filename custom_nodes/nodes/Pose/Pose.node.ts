import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import {
	findProjectId,
	getTouchUpPositionsFromDb,
	getTouchUpPositionFromDb,
	saveTouchUpPositionToDb,
} from '../common/dbClient';

const BASE_URL = 'http://host.docker.internal:8080/pose';

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
					{ name: 'Align', value: 'align' },
					{ name: 'Get Touch Up Positions', value: 'getTouchUpPositions' },
					{ name: 'Set Touch Up Positions', value: 'setTouchUpPositions' },
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

			// ── Align Parameters ─────────────────────────────────────────
			{
				displayName: 'Rotation Axis',
				name: 'rotationAxis',
				type: 'options',
				displayOptions: { show: { operation: ['align'] } },
				options: [
					{ name: 'X', value: 'x' },
					{ name: 'Y', value: 'y' },
					{ name: 'Z', value: 'z' },
					{ name: 'Custom', value: 'custom' },
				],
				default: 'z',
				description: 'Local axis to rotate the pose around',
			},
			{
				displayName: 'Custom Rotation Axis',
				name: 'customRotationAxis',
				type: 'string',
				displayOptions: {
					show: { operation: ['align'], rotationAxis: ['custom'] },
				},
				default: '[0, 0, 1]',
				description: 'Custom rotation axis as [x, y, z]',
			},
			{
				displayName: 'Aligned Axis',
				name: 'alignAxis',
				type: 'options',
				displayOptions: { show: { operation: ['align'] } },
				options: [
					{ name: 'X', value: 'x' },
					{ name: 'Y', value: 'y' },
					{ name: 'Z', value: 'z' },
					{ name: 'Custom', value: 'custom' },
				],
				default: 'x',
				description: 'Local axis of the pose to align',
			},
			{
				displayName: 'Custom Aligned Axis',
				name: 'customAlignAxis',
				type: 'string',
				displayOptions: {
					show: { operation: ['align'], alignAxis: ['custom'] },
				},
				default: '[1, 0, 0]',
				description: 'Custom aligned axis as [x, y, z]',
			},
			{
				displayName: 'Target Vector',
				name: 'targetVector',
				type: 'string',
				displayOptions: { show: { operation: ['align'] } },
				default: '[0, 0, 1]',
				description: 'Target direction vector in the parent frame to align the axis towards',
			},
			{
				displayName: 'Publish TF',
				name: 'publishTf',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['chain', 'rotate', 'translate', 'align'],
					},
				},
				default: true,
				description: 'Whether to publish this pose as a ROS TF frame',
			},
			{
				displayName: 'TF Frame Name',
				name: 'tfName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['chain', 'rotate', 'translate', 'align'],
					},
				},
				default: '',
				description: 'Override name/label for the output pose and TF frame',
			},

			// ── Touch Up & Read Parameters ───────────────────────────────
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['getTouchUpPositions', 'setTouchUpPositions'],
					},
				},
				options: [
					{ name: 'Joints', value: 'joints' },
					{ name: 'Poses', value: 'poses' },
				],
				default: 'joints',
				description: 'Choose between Joints and Poses',
			},
			{
				displayName: 'Movement',
				name: 'movement',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['getTouchUpPositions'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getMovements',
					loadOptionsDependsOn: [
						'type',
					],
				},
				default: '',
				description: 'The movement to select',
			},
			{
				displayName: 'Movement Name',
				name: 'movementName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['setTouchUpPositions'],
					},
				},
				default: '',
				description: 'The name of the movement to save',
			},
			{
				displayName: 'Save Mode',
				name: 'saveMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['setTouchUpPositions'],
					},
				},
				options: [
					{ name: 'Single Position', value: 'single' },
					{ name: 'Multi-Point Trajectory', value: 'trajectory' },
				],
				default: 'single',
				description: 'Choose whether to save each item as a single position or combine items into one multi-point trajectory',
			},
			{
				displayName: 'Data Input',
				name: 'dataInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['setTouchUpPositions'],
					},
				},
				default: '{}',
				description: 'The pose object or joints dictionary to save',
			},
		],
	};

	methods = {
		loadOptions: {
			async getMovements(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const nodeParams = this.getCurrentNodeParameters();
				const type = nodeParams?.type as string;
				if (!type) {
					return [];
				}

				try {
					const workflow = this.getWorkflow();
					const wfId = workflow.id === 'undefined' ? undefined : workflow.id;
					const wfName = workflow.name === 'undefined' ? undefined : workflow.name;

					const projectId = await findProjectId(wfId, wfName);
					const positionsData = await getTouchUpPositionsFromDb(projectId);
					const keyType = type.startsWith('pose') ? 'poses' : 'joints';
					const group = positionsData[keyType] || {};

					const options: INodePropertyOptions[] = Object.keys(group).map(name => ({
						name,
						value: name,
					}));

					console.log(`[Pose Node] Loaded options from DB for project ${projectId}: ${JSON.stringify(options)}`);
					return options;
				} catch (error: any) {
					console.error(`[Pose Node] Error in getMovements: ${error.message}`);
					return [];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		let items = this.getInputData();
		const operationCheck = this.getNodeParameter('operation', 0, '') as string;

		if (operationCheck === 'getTouchUpPositions' && (!items || items.length === 0 || Object.keys(items[0].json).length === 0)) {
			items = [{ json: {} }];
		} else if (!items || items.length === 0 || Object.keys(items[0].json).length === 0) {
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

				if (operation === 'getTouchUpPositions') {
					const type = this.getNodeParameter('type', i) as string;
					const movement = this.getNodeParameter('movement', i) as string;

					const workflow = this.getWorkflow();
					const projectId = await findProjectId(workflow.id, workflow.name);

					const json = await getTouchUpPositionFromDb(projectId, type, movement);

					if (type === 'poses') {
						returnData.push({ json });
					} else {
						// Ensure downstream nodes can access $json.joints (joint map) AND $json.points (trajectory waypoints)
						if (json && typeof json === 'object' && ('joints' in json || 'points' in json)) {
							returnData.push({ json: { ...json, joints: json.joints || {}, points: json.points || [] } });
						} else {
							returnData.push({ json: { joints: json } });
						}
					}
					continue;
				}

				if (operation === 'setTouchUpPositions') {
					const type = this.getNodeParameter('type', i) as string;
					const movementName = this.getNodeParameter('movementName', i) as string;
					const saveMode = this.getNodeParameter('saveMode', i, 'single') as string;
					const dataInputParam = this.getNodeParameter('dataInput', i);

					let inputData: any;
					let hasDataInput = false;
					if (typeof dataInputParam === 'object' && dataInputParam !== null && Object.keys(dataInputParam).length > 0) {
						inputData = dataInputParam;
						hasDataInput = true;
					} else if (typeof dataInputParam === 'string' && dataInputParam.trim() !== '' && dataInputParam.trim() !== '{}') {
						try {
							inputData = JSON.parse(dataInputParam.trim());
							hasDataInput = true;
						} catch (e: any) {
							throw new NodeOperationError(
								this.getNode(),
								`Error parsing Data Input JSON: ${e.message}`,
								{ itemIndex: i },
							);
						}
					}

					let inputsArray: any[] = [];
					let useLoopIndexSuffix = false;

					if (hasDataInput) {
						if (Array.isArray(inputData)) {
							inputsArray = inputData.map(item => {
								if (item && typeof item === 'object' && 'json' in item) {
									return item.json;
								}
								return item;
							});
						} else {
							inputsArray = [inputData];
						}
					} else {
						// Fallback to the current item's json from the previous node
						inputsArray = [items[i]?.json || {}];
						useLoopIndexSuffix = true;
					}

					if (inputsArray.length === 0) {
						inputsArray = [{}];
					}

					const workflow = this.getWorkflow();
					const projectId = await findProjectId(workflow.id, workflow.name);

					const targetName = movementName && movementName.trim() !== '' ? movementName.trim() : type;

					if (saveMode === 'trajectory') {
						// Combine all incoming items/points into a single multi-point trajectory
						let outputData: any;
						let trajectoryPoints: any[] = [];

						if (type === 'poses') {
							if (inputsArray.length === 1 && Array.isArray(inputsArray[0]?.points)) {
								trajectoryPoints = inputsArray[0].points;
							} else {
								trajectoryPoints = inputsArray.map((item, idx) => {
									const pSrc = item?.pose || item?.Pose || item?.Robot || item;
									return {
										time_from_start: typeof item?.time_from_start === 'number' ? item.time_from_start : idx * 1.0,
										position: pSrc.position || [0, 0, 0],
										orientation: pSrc.orientation || [1, 0, 0, 0],
										euler_deg: pSrc.euler_deg,
										parent: pSrc.parent || 'world',
										link: pSrc.link || 'tool0',
									};
								});
							}

							const firstPt = trajectoryPoints[0] || {};
							outputData = {
								name: targetName,
								label: targetName,
								type: 'pose',
								parent: firstPt.parent || 'world',
								link: firstPt.link || 'tool0',
								position: firstPt.position || [0, 0, 0],
								orientation: firstPt.orientation || [1, 0, 0, 0],
								euler_deg: firstPt.euler_deg,
								points: trajectoryPoints,
							};
						} else {
							if (inputsArray.length === 1 && Array.isArray(inputsArray[0]?.points)) {
								trajectoryPoints = inputsArray[0].points;
							} else {
								trajectoryPoints = inputsArray.map((item, idx) => {
									const jSrc = item?.joints && typeof item.joints === 'object' && !Array.isArray(item.joints) ? item.joints : item;
									const tVal = typeof item?.time_from_start === 'number' ? item.time_from_start : idx * 1.0;
									const cleanJoints: Record<string, number> = {};
									for (const [k, v] of Object.entries(jSrc)) {
										if (k !== 'time_from_start' && k !== 'points' && k !== 'joints') {
											cleanJoints[k] = typeof v === 'number' ? v : parseFloat(v as any) || 0.0;
										}
									}
									return {
										time_from_start: tVal,
										joints: cleanJoints,
									};
								});
							}

							const firstPt = trajectoryPoints[0] || {};
							outputData = {
								name: targetName,
								label: targetName,
								type: 'joints',
								joints: firstPt.joints || {},
								points: trajectoryPoints,
							};
						}

						await saveTouchUpPositionToDb(projectId, targetName, type, outputData);
						returnData.push({ json: { success: true, projectId, name: targetName, data: outputData, count: trajectoryPoints.length, mode: 'trajectory' } });
					} else {
						// Single Position Mode: each item creates an entry (or preserves existing points if provided)
						let firstOutputData: any = null;
						let firstName = '';

						for (let j = 0; j < inputsArray.length; j++) {
							const currentInput = inputsArray[j];
							const suffixIndex = useLoopIndexSuffix ? i : j;
							const suffix = suffixIndex > 0 ? `_${suffixIndex}` : '';
							const entryName = `${targetName}${suffix}`;

							let outputData: any;

							if (type === 'poses') {
								let poseSource = currentInput;
								if (currentInput && typeof currentInput === 'object') {
									if (currentInput.pose && typeof currentInput.pose === 'object') {
										poseSource = currentInput.pose;
									} else if (currentInput.Pose && typeof currentInput.Pose === 'object') {
										poseSource = currentInput.Pose;
									} else if (currentInput.Robot && typeof currentInput.Robot === 'object') {
										poseSource = currentInput.Robot;
									}
								}

								const pos = poseSource.position || [0, 0, 0];
								const ori = poseSource.orientation || [1, 0, 0, 0];
								const pts = Array.isArray(poseSource.points) && poseSource.points.length > 0
									? poseSource.points
									: [{ time_from_start: 0.0, position: pos, orientation: ori, parent: poseSource.parent || 'world', link: poseSource.link || 'tool0' }];

								outputData = {
									name: entryName,
									label: entryName,
									type: 'pose',
									parent: poseSource.parent || 'world',
									link: poseSource.link || 'tool0',
									position: pos,
									orientation: ori,
									euler_deg: poseSource.euler_deg,
									points: pts,
								};
							} else {
								let jointsDict = currentInput;
								if (currentInput.joints && typeof currentInput.joints === 'object' && !Array.isArray(currentInput.joints)) {
									jointsDict = currentInput.joints;
								}

								const pts = Array.isArray(currentInput.points)
									? currentInput.points
									: Array.isArray(jointsDict.points)
									? jointsDict.points
									: [{ time_from_start: 0.0, joints: jointsDict }];

								outputData = {
									name: entryName,
									label: entryName,
									type: 'joints',
									joints: pts[0]?.joints || jointsDict,
									points: pts,
								};
							}

							await saveTouchUpPositionToDb(projectId, entryName, type, outputData);

							if (j === 0) {
								firstName = entryName;
								firstOutputData = outputData;
							}
						}

						returnData.push({ json: { success: true, projectId, name: firstName, data: firstOutputData, count: inputsArray.length, mode: 'single' } });
					}
					continue;
				}

				// ── Get Pose A (Parent, from Input 1) ─────────────────
				const poseA = items[i].json as object;

				// ── Common publish parameters for pose operations ────
				let publishTfParams = {};
				if (['chain', 'rotate', 'translate', 'align'].includes(operation)) {
					const publish_tf = this.getNodeParameter('publishTf', i, true) as boolean;
					const tf_name = this.getNodeParameter('tfName', i, '') as string;
					publishTfParams = { publish_tf, tf_name };
				}

				// ── Build request based on operation ─────────────────
				let url: string;
				let body: object;

				switch (operation) {
					case 'chain': {
						const itemB = itemsB[i] || itemsB[0];
						if (!itemB) {
							throw new NodeOperationError(
								this.getNode(),
								`Second input (Child Pose from Vision) is required but not connected or empty`,
								{ itemIndex: i },
							);
						}
						const poseB = itemB.json as object;
						url = `${BASE_URL}/chain`;
						body = { pose_a: poseA, pose_b: poseB, ...publishTfParams };
						break;
					}

					case 'distance': {
						const itemB = itemsB[i] || itemsB[0];
						if (!itemB) {
							throw new NodeOperationError(
								this.getNode(),
								`Second input (Child Pose from Vision) is required but not connected or empty`,
								{ itemIndex: i },
							);
						}
						const poseB = itemB.json as object;
						url = `${BASE_URL}/distance`;
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
						body = { pose: poseA, axis, angle, degrees, frame, ...publishTfParams };
						break;
					}

					case 'translate': {
						const translation = JSON.parse(
							this.getNodeParameter('translation', i) as string,
						);
						const frame = this.getNodeParameter('translationFrame', i) as string;
						url = `${BASE_URL}/translate`;
						body = { pose: poseA, translation, frame, ...publishTfParams };
						break;
					}

					case 'euler': {
						const sequence = this.getNodeParameter('eulerSequence', i) as string;
						const degrees = this.getNodeParameter('degrees', i) as boolean;
						url = `${BASE_URL}/euler`;
						body = { pose: poseA, sequence, degrees };
						break;
					}

					case 'align': {
						const rotAxisParam = this.getNodeParameter('rotationAxis', i) as string;
						let rotation_axis: string | number[];
						if (rotAxisParam === 'custom') {
							rotation_axis = JSON.parse(this.getNodeParameter('customRotationAxis', i) as string);
						} else {
							rotation_axis = rotAxisParam;
						}

						const alignAxisParam = this.getNodeParameter('alignAxis', i) as string;
						let align_axis: string | number[];
						if (alignAxisParam === 'custom') {
							align_axis = JSON.parse(this.getNodeParameter('customAlignAxis', i) as string);
						} else {
							align_axis = alignAxisParam;
						}

						const target_vector = JSON.parse(this.getNodeParameter('targetVector', i) as string);

						url = `${BASE_URL}/align`;
						body = { pose: poseA, rotation_axis, align_axis, target_vector, ...publishTfParams };
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



