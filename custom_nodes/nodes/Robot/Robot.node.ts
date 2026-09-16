import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';
import { findProjectId, getGrippersFromDb } from '../common/dbClient';

export class Robot implements INodeType {
	async onStop(this: IExecuteFunctions): Promise<void> {
		console.log('[RobotNode] ON_STOP TRIGGERED! Sending POST /stop to planning_server...');
		try {
			await this.helpers.httpRequest({
				method: 'POST',
				url: 'http://host.docker.internal:8080/stop',
				body: {},
				json: true,
				timeout: 2000,
			});
			console.log('[RobotNode] Emergency POST /stop executed successfully.');
		} catch (e) {
			console.error('[RobotNode] Error during emergency stop:', e);
		}
	}

	description: INodeTypeDescription = {
		displayName: 'Robot',
		name: 'robot',
		icon: 'file:robotic_arm.svg',
		group: ['robotics'] as any,
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Robot Control (Move and Get Pose)',
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
						name: 'Move Relative',
						value: 'moveRelative',
					},
					{
						name: 'Move Joint Trajectory',
						value: 'moveJointTrajectory',
					},
					{
						name: 'Move Cartesian Trajectory',
						value: 'moveCartesianTrajectory',
					},
					{
						name: 'Get Position',
						value: 'getPose',
					},
					{
						name: 'Stop Robot',
						value: 'stop',
						description: 'Emergency stop robot trajectory and hold current position',
					},
				],
				default: 'move',
			},
			{
				displayName: 'Output Type',
				name: 'getPoseType',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['getPose'],
					},
				},
				options: [
					{
						name: 'Cartesian Pose',
						value: 'cartesian',
					},
					{
						name: 'Joint States',
						value: 'joints',
					},
				],
				default: 'cartesian',
				description: 'Select whether to get the Cartesian pose or the joint states',
				required: true,
			},
			{
				displayName: 'Workflow ID',
				name: 'workflowId',
				type: 'hidden',
				default: '={{ $workflow.id }}',
			},
			{
				displayName: 'Tool Name',
				name: 'toolName',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['move', 'moveRelative', 'moveJointTrajectory', 'moveCartesianTrajectory', 'getPose'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getGrippers',
				},
				default: '',
				description: 'Select the reference end-effector / kinematic chain',
				required: true,
			},
			{
				displayName: 'Pose Source',
				name: 'poseSource',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['move'],
					},
				},
				options: [
					{ name: 'Manual (type below)', value: 'manual' },
					{ name: 'From Input Node', value: 'input' },
				],
				default: 'manual',
				description: 'Choose whether to type the target pose manually or read it from the data arriving from the previous node (e.g. a Pose / Touch-up node)',
				required: true,
			},
			{
				displayName: 'Trajectory Mode',
				name: 'trajectoryMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['move'],
						poseSource: ['input'],
					},
				},
				options: [
					{ name: 'Initial Pose Only', value: 'first' },
					{ name: 'Execute Full Trajectory', value: 'full' },
				],
				default: 'first',
				description: 'If the input contains a multi-point trajectory, choose whether to move only to the first waypoint or execute all waypoints in sequence',
			},
			{
				displayName: 'Robot Pose',
				name: 'poseInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['move'],
						poseSource: ['manual'],
					},
				},
				default: '{\n  "position": [0, 0, 0],\n  "orientation": [1, 0, 0, 0]\n}',
				description: 'Enter the JSON containing position and orientation',
				required: true,
			},
			{
				displayName: 'Relative Displacement (Delta X, Y, Z)',
				name: 'positionDelta',
				type: 'fixedCollection',
				placeholder: 'Add Delta',
				default: {},
				displayOptions: {
					show: {
						operation: ['moveRelative'],
					},
				},
				options: [
					{
						name: 'delta',
						displayName: 'Delta',
						values: [
							{
								displayName: 'X (m)',
								name: 'x',
								type: 'number',
								default: 0.0,
								typeOptions: {
									numberStep: 0.001,
								},
								description: 'Relative displacement along X axis',
							},
							{
								displayName: 'Y (m)',
								name: 'y',
								type: 'number',
								default: 0.0,
								typeOptions: {
									numberStep: 0.001,
								},
								description: 'Relative displacement along Y axis',
							},
							{
								displayName: 'Z (m)',
								name: 'z',
								type: 'number',
								default: 0.0,
								typeOptions: {
									numberStep: 0.001,
								},
								description: 'Relative displacement along Z axis',
							},
						],
					},
				],
			},
			{
				displayName: 'Relative Rotation (Delta Roll, Pitch, Yaw)',
				name: 'orientationDelta',
				type: 'fixedCollection',
				placeholder: 'Add Rotation',
				default: {},
				displayOptions: {
					show: {
						operation: ['moveRelative'],
					},
				},
				options: [
					{
						name: 'delta',
						displayName: 'Delta',
						values: [
							{
								displayName: 'Roll (deg)',
								name: 'roll',
								type: 'number',
								default: 0.0,
								typeOptions: {
									numberStep: 1.0,
								},
								description: 'Relative rotation around X axis',
							},
							{
								displayName: 'Pitch (deg)',
								name: 'pitch',
								type: 'number',
								default: 0.0,
								typeOptions: {
									numberStep: 1.0,
								},
								description: 'Relative rotation around Y axis',
							},
							{
								displayName: 'Yaw (deg)',
								name: 'yaw',
								type: 'number',
								default: 0.0,
								typeOptions: {
									numberStep: 1.0,
								},
								description: 'Relative rotation around Z axis',
							},
						],
					},
				],
			},
			{
				displayName: 'Reference Frame',
				name: 'referenceFrame',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['moveRelative'],
					},
				},
				options: [
					{
						name: 'World',
						value: 'world',
					},
					{
						name: 'Tool',
						value: 'tool',
					},
				],
				default: 'tool',
				description: 'Select whether the relative movement refers to the World frame or the current Tool frame',
				required: true,
			},
			{
				displayName: 'Trajectory Source',
				name: 'jointTrajectorySource',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['moveJointTrajectory'],
					},
				},
				options: [
					{ name: 'From Input Node', value: 'input' },
					{ name: 'Manual (type below)', value: 'manual' },
				],
				default: 'input',
				description: 'Choose whether to read the joint trajectory from the input node or type it manually',
				required: true,
			},
			{
				displayName: 'Joint Trajectory',
				name: 'trajectoryInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['moveJointTrajectory'],
						jointTrajectorySource: ['manual'],
					},
				},
				default: '[\n  {\n    "time_from_start": 2.0,\n    "J1": 0.0,\n    "J2": 0.0\n  }\n]',
				description: 'Enter the list of joint waypoints with time_from_start',
				required: true,
			},
			{
				displayName: 'Trajectory Source',
				name: 'cartesianTrajectorySource',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['moveCartesianTrajectory'],
					},
				},
				options: [
					{ name: 'From Input Node', value: 'input' },
					{ name: 'Manual (type below)', value: 'manual' },
				],
				default: 'input',
				description: 'Choose whether to read the Cartesian trajectory from the input node or type it manually',
				required: true,
			},
			{
				displayName: 'Cartesian Trajectory',
				name: 'cartesianTrajectoryInput',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['moveCartesianTrajectory'],
						cartesianTrajectorySource: ['manual'],
					},
				},
				default: '[\n  {\n    "position": [0, 0, 0],\n    "orientation": [1, 0, 0, 0]\n  }\n]',
				description: 'Enter the list of Cartesian waypoints with position and orientation',
				required: true,
			},
			{
				displayName: 'Velocity (mm/s)',
				name: 'velocity',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['move', 'moveRelative', 'moveJointTrajectory', 'moveCartesianTrajectory'],
					},
				},
				typeOptions: {
					minValue: 1.0,
					maxValue: 5000.0,
				},
				default: 100,
				description: 'Robot movement velocity in millimeters per second (mm/s)',
				required: true,
			},
			{
				displayName: 'Movement Timeout',
				name: 'timeout',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['move', 'moveRelative', 'moveJointTrajectory', 'moveCartesianTrajectory'],
					},
				},
				typeOptions: {
					minValue: 1.0,
					maxValue: 300.0,
				},
				default: 10,
				description: 'Maximum time in seconds to complete the movement',
				required: true,
			},
			{
				displayName: 'Planner',
				name: 'planner',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['move', 'moveCartesianTrajectory'],
					},
				},
				options: [
					{
						name: 'OMPL (RRTConnect)',
						value: 'OMPL',
					},
					{
						name: 'OMPL RRT*',
						value: 'RRTstar',
					},
					{
						name: 'cuMotion',
						value: 'CUMOTION',
					},
					{
						name: 'PILZ LIN',
						value: 'LIN',
					},
					{
						name: 'PILZ CIRC',
						value: 'CIRC',
					},
					{
						name: 'PILZ PTP',
						value: 'PTP',
					},
				],
				default: 'OMPL',
				description: 'Movement planner. Note: OMPL and cuMotion avoid collisions.',
				required: true,
			},
			{
				displayName: 'Disable Collision Check',
				name: 'disableCollision',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['move', 'moveRelative', 'moveCartesianTrajectory'],
					},
				},
				default: false,
				description: 'If enabled, collision checking against scene objects is disabled for this move. Use with caution.',
				required: true,
			},
			{
				displayName: 'Link Name',
				name: 'linkName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['getPose'],
						getPoseType: ['cartesian'],
					},
				},
				default: '',
				description: 'Name of the link to get the pose of. Fill only this or only Tool Name.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getGrippers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const params = this.getCurrentNodeParameters() as any;
					const workflowId = params?.workflowId as string | undefined;
					const workflow = this.getWorkflow();
					const rawWfId = (workflow.id && workflow.id !== 'undefined')
						? workflow.id
						: (workflowId && !workflowId.startsWith('={{') && workflowId !== 'undefined' ? workflowId : undefined);
					const wfName = (workflow.name && workflow.name !== 'undefined') ? workflow.name : undefined;
					const projectId = await findProjectId(rawWfId, wfName);
					return await getGrippersFromDb(projectId);
				} catch (e) {
					console.error(`[Robot Node] Error loading grippers from database:`, e);
					return [];
				}
			}
		}
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'move' || operation === 'moveRelative') {
					const toolName = this.getNodeParameter('toolName', i) as string;
					let body: object;

					if (operation === 'move') {
						const poseSource = this.getNodeParameter('poseSource', i, 'manual') as string;
						if (poseSource === 'input') {
							const trajectoryMode = this.getNodeParameter('trajectoryMode', i, 'first') as string;
							const inputData = items[i].json as any;

							// Check if the input contains a multi-point trajectory and user requested full execution
							if (trajectoryMode === 'full' && Array.isArray(inputData.points) && inputData.points.length > 1) {
								const pts = inputData.points;
								const timeout = this.getNodeParameter('timeout', i) as number;
								const planner = this.getNodeParameter('planner', i) as string;
								const velocity = this.getNodeParameter('velocity', i) as number;
								const disableCollision = this.getNodeParameter('disableCollision', i, false) as boolean;
								const stepResults: any[] = [];
								for (let idx = 0; idx < pts.length; idx++) {
									const pt = pts[idx];
									const pSrc = pt.pose || pt.Pose || pt;
									const stepBody = {
										position: pSrc.position || [0, 0, 0],
										orientation: pSrc.orientation || [1, 0, 0, 0],
										parent: pSrc.parent || inputData.parent || 'world',
										tool_name: toolName,
										timeout,
										planner,
										velocity,
										disable_collision: disableCollision,
									};
									const res = await this.helpers.httpRequest({
										method: 'POST',
										url: 'http://host.docker.internal:8080/move_to_pose',
										body: stepBody,
										json: true,
									});
									stepResults.push(res);
								}
								returnData.push({ json: { success: true, count: stepResults.length, waypoints: stepResults } });
								continue;
							}

							if (inputData.Robot && typeof inputData.Robot === 'object') {
								body = inputData.Robot;
							} else if (inputData.Pose && typeof inputData.Pose === 'object') {
								body = inputData.Pose;
							} else if (inputData.position && inputData.orientation) {
								body = inputData;
							} else if (Array.isArray(inputData.points) && inputData.points.length > 0) {
								body = inputData.points[0];
							} else {
								throw new Error(`Pose Source is set to 'From Input Node' but no valid pose was found in the input data. Expected keys: 'position' and 'orientation' (or wrapped under 'Robot' / 'Pose' / 'points').`);
							}
						} else {
							// Manual: read from the poseInput JSON field
							const poseInputParam = this.getNodeParameter('poseInput', i);
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
								throw new Error(`Parameter 'Robot Pose' is empty. Either fill in the JSON or switch Pose Source to 'From Input Node'.`);
							}
						}
					} else {
						const positionDelta = this.getNodeParameter('positionDelta', i, {}) as any;
						const orientationDelta = this.getNodeParameter('orientationDelta', i, {}) as any;
						const referenceFrame = this.getNodeParameter('referenceFrame', i) as string;

						const deltaX = positionDelta?.delta?.x ?? 0.0;
						const deltaY = positionDelta?.delta?.y ?? 0.0;
						const deltaZ = positionDelta?.delta?.z ?? 0.0;

						const deltaRollDeg = orientationDelta?.delta?.roll ?? 0.0;
						const deltaPitchDeg = orientationDelta?.delta?.pitch ?? 0.0;
						const deltaYawDeg = orientationDelta?.delta?.yaw ?? 0.0;

						// Convert degrees to radians
						const deltaRoll = deltaRollDeg * Math.PI / 180.0;
						const deltaPitch = deltaPitchDeg * Math.PI / 180.0;
						const deltaYaw = deltaYawDeg * Math.PI / 180.0;

						const parent = referenceFrame === 'world'
							? 'world'
							: (toolName && toolName.trim() !== '' ? `${toolName.trim()}_tcp` : 'tool0_tcp');
						const orientation = eulerToQuaternion(deltaRoll, deltaPitch, deltaYaw);

						body = {
							parent,
							position: [deltaX, deltaY, deltaZ],
							orientation: orientation,
						};
					}

					const endpoint = operation === 'move' ? 'move_to_pose' : 'move_relative';
					const timeout = this.getNodeParameter('timeout', i) as number;
					const planner = operation === 'move' ? (this.getNodeParameter('planner', i) as string) : 'LIN';
					const velocity = this.getNodeParameter('velocity', i) as number;
					const disableCollision = this.getNodeParameter('disableCollision', i, false) as boolean;
					(body as any).tool_name = toolName;
					(body as any).timeout = timeout;
					(body as any).planner = planner;
					(body as any).velocity = velocity;
					(body as any).disable_collision = disableCollision;
					let requestSucceeded = false;
					try {
						const result = await this.helpers.httpRequest({
							method: 'POST',
							url: `http://host.docker.internal:8080/${endpoint}`,
							body,
							json: true,
						});
						requestSucceeded = true;
						returnData.push({ json: result });
					} finally {
						if (!requestSucceeded) {
							try {
								await this.helpers.httpRequest({
									method: 'POST',
									url: 'http://host.docker.internal:8080/stop',
									body: {},
									json: true,
									timeout: 2000,
								});
							} catch (e) {
								// Ignore
							}
						}
					}

				} else if (operation === 'moveCartesianTrajectory') {
					const toolName = this.getNodeParameter('toolName', i) as string;
					const trajectorySource = this.getNodeParameter('cartesianTrajectorySource', i, 'input') as string;
					const velocity = this.getNodeParameter('velocity', i) as number;
					const timeout = this.getNodeParameter('timeout', i) as number;
					const planner = this.getNodeParameter('planner', i, 'LIN') as string;
					const disableCollision = this.getNodeParameter('disableCollision', i, false) as boolean;
					let rawWaypoints: any[];

					if (trajectorySource === 'input') {
						const inputData = items[i].json as any;
						if (Array.isArray(inputData)) {
							rawWaypoints = inputData;
						} else if (inputData.points && Array.isArray(inputData.points)) {
							rawWaypoints = inputData.points;
						} else if (inputData.trajectory && Array.isArray(inputData.trajectory)) {
							rawWaypoints = inputData.trajectory;
						} else if (inputData.position && inputData.orientation) {
							rawWaypoints = [inputData];
						} else {
							throw new Error("Cartesian Trajectory Source is 'From Input Node', but no valid waypoints found ('points', 'trajectory', or 'position'/'orientation').");
						}
					} else {
						const inputParam = this.getNodeParameter('cartesianTrajectoryInput', i);
						if (typeof inputParam === 'object' && Array.isArray(inputParam)) {
							rawWaypoints = inputParam;
						} else if (typeof inputParam === 'string' && inputParam.trim() !== '') {
							try {
								rawWaypoints = JSON.parse(inputParam.trim());
							} catch (e: any) {
								throw new Error(`Error parsing Cartesian Trajectory JSON: ${e.message}`);
							}
						} else {
							throw new Error("Parameter 'Cartesian Trajectory' is empty or invalid.");
						}
					}

					const results: any[] = [];
					let cartesianSucceeded = false;
					try {
						for (let w = 0; w < rawWaypoints.length; w++) {
							const wp = rawWaypoints[w];
							const pSrc = wp.pose || wp.Pose || wp;
							const body: Record<string, any> = {
								position: pSrc.position || [0, 0, 0],
								orientation: pSrc.orientation || [1, 0, 0, 0],
								parent: pSrc.parent || 'world',
								tool_name: toolName,
								timeout: timeout,
								planner: planner,
								velocity: velocity,
								disable_collision: disableCollision,
							};
							const res = await this.helpers.httpRequest({
								method: 'POST',
								url: 'http://host.docker.internal:8080/move_to_pose',
								body,
								json: true,
							});
							results.push(res);
						}
						cartesianSucceeded = true;
						returnData.push({ json: { success: true, count: results.length, waypoints: results } });
					} finally {
						if (!cartesianSucceeded) {
							try {
								await this.helpers.httpRequest({
									method: 'POST',
									url: 'http://host.docker.internal:8080/stop',
									body: {},
									json: true,
									timeout: 2000,
								});
							} catch (e) {
								// Ignore
							}
						}
					}

				} else if (operation === 'moveJointTrajectory') {
					const toolName = this.getNodeParameter('toolName', i) as string;
					const trajectorySource = this.getNodeParameter('jointTrajectorySource', i, 'input') as string;
					const velocity = this.getNodeParameter('velocity', i) as number;
					const timeout = this.getNodeParameter('timeout', i) as number;
					let rawTrajectory: any[];

					if (trajectorySource === 'input') {
						const inputData = items[i].json as any;
						if (Array.isArray(inputData)) {
							rawTrajectory = inputData;
						} else if (inputData.points && Array.isArray(inputData.points)) {
							rawTrajectory = inputData.points;
						} else if (inputData.trajectory && Array.isArray(inputData.trajectory)) {
							rawTrajectory = inputData.trajectory;
						} else if (inputData.joints && Array.isArray(inputData.joints.points)) {
							rawTrajectory = inputData.joints.points;
						} else if (inputData.joints && typeof inputData.joints === 'object') {
							rawTrajectory = [{ time_from_start: 0.0, ...inputData.joints }];
						} else {
							throw new Error("Joint Trajectory Source is 'From Input Node', but no valid trajectory was found in input data ('points', 'trajectory', or 'joints').");
						}
					} else {
						const trajectoryInputParam = this.getNodeParameter('trajectoryInput', i);
						if (typeof trajectoryInputParam === 'object' && Array.isArray(trajectoryInputParam)) {
							rawTrajectory = trajectoryInputParam;
						} else if (typeof trajectoryInputParam === 'string' && trajectoryInputParam.trim() !== '') {
							const trimmed = trajectoryInputParam.trim();
							try {
								rawTrajectory = JSON.parse(trimmed);
							} catch (e: any) {
								throw new Error(`Error in parsing input JSON for 'Joint Trajectory' (received value: "${trimmed}"): ${e.message}`);
							}
						} else {
							throw new Error(`Parameter 'Joint Trajectory' is empty or invalid.`);
						}
					}

					// Normalize each waypoint into { time_from_start, [joint_name]: number }
					const trajectory = rawTrajectory.map((pt: any, idx: number) => {
						const tVal = typeof pt.time_from_start === 'number' ? pt.time_from_start : idx * 1.0;
						const jMap = pt.joints && typeof pt.joints === 'object' ? pt.joints : pt;
						const entry: Record<string, any> = { time_from_start: tVal };
						for (const [k, v] of Object.entries(jMap)) {
							if (k !== 'time_from_start' && k !== 'joints') {
								entry[k] = typeof v === 'number' ? v : parseFloat(v as any) || 0.0;
							}
						}
						return entry;
					});

					let trajSucceeded = false;
					try {
						const result = await this.helpers.httpRequest({
							method: 'POST',
							url: `http://host.docker.internal:8080/move_joint_trajectory`,
							body: {
								trajectory,
								velocity: velocity,
								tool_name: toolName,
								timeout: timeout,
							},
							json: true,
						});
						trajSucceeded = true;
						returnData.push({ json: result });
					} finally {
						if (!trajSucceeded) {
							try {
								await this.helpers.httpRequest({
									method: 'POST',
									url: 'http://host.docker.internal:8080/stop',
									body: {},
									json: true,
									timeout: 2000,
								});
							} catch (e) {
								// Ignore
							}
						}
					}

				} else if (operation === 'getPose') {
					const getPoseType = this.getNodeParameter('getPoseType', i) as string;
					
					if (getPoseType === 'joints') {
						const toolName = this.getNodeParameter('toolName', i) as string;
						const qs: Record<string, string> = {};
						if (toolName !== '') {
							qs.tool_name = toolName;
						}
						const result = await this.helpers.httpRequest({
							method: 'GET',
							url: 'http://host.docker.internal:8080/get_joints',
							qs,
							json: true,
						});
						returnData.push({ json: result });
					} else {
						const toolName = this.getNodeParameter('toolName', i) as string;
						const link = (this.getNodeParameter('linkName', i) as string).trim();
						const hasLink = link !== '';
						const hasTool = toolName !== '';

						if (!hasLink && !hasTool) {
							throw new NodeOperationError(
								this.getNode(),
								'Get Position: compilare almeno uno tra Link Name e Tool Name.',
								{ itemIndex: i },
							);
						}

						const qs: Record<string, string> = {};
						if (hasLink) {
							qs.link = link;
						} else {
							qs.tool_name = toolName;
						}

						const result = await this.helpers.httpRequest({
							method: 'GET',
							url: 'http://host.docker.internal:8080/get_pose',
							qs,
							json: true,
						});
						returnData.push({ json: result });
					}
				} else if (operation === 'stop') {
					const result = await this.helpers.httpRequest({
						method: 'POST',
						url: 'http://host.docker.internal:8080/stop',
						body: {},
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

function eulerToQuaternion(roll: number, pitch: number, yaw: number): number[] {
	const cr = Math.cos(roll * 0.5);
	const sr = Math.sin(roll * 0.5);
	const cp = Math.cos(pitch * 0.5);
	const sp = Math.sin(pitch * 0.5);
	const cy = Math.cos(yaw * 0.5);
	const sy = Math.sin(yaw * 0.5);

	const w = cr * cp * cy + sr * sp * sy;
	const x = sr * cp * cy - cr * sp * sy;
	const y = cr * sp * cy + sr * cp * sy;
	const z = cr * cp * sy - sr * sp * cy;

	return [w, x, y, z];
}

