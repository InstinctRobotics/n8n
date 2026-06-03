import { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class Vision implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Vision',
		name: 'vision',
		icon: 'file:camera.svg',
		group: ['robotics'] as any,
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Controllo Vision (Get Frame and Get Pose)',
		defaults: {
			name: 'Vision',
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
						name: 'Get Frame',
						value: 'getFrame',
						routing: {
							request: {
								method: 'GET',
								url: 'http://host.docker.internal:8081/get_frame',
								encoding: 'arraybuffer',
								returnFullResponse: true,
							},
							output: {
								postReceive: [
									async function (this, items, responseData) {
										const binaryData = await this.helpers.prepareBinaryData(
											responseData.body as Buffer,
											'frame.jpg',
											'image/jpeg',
										);
										return [
											{
												json: {
													success: true,
												},
												binary: {
													data: binaryData,
												},
											},
										];
									},
								],
							},
						},
					},
					{
						name: 'Get Pose',
						value: 'getPose',
						routing: {
							request: {
								method: 'GET',
								url: 'http://host.docker.internal:8081/get_pose',
								returnFullResponse: true,
							},
							output: {
								postReceive: [
									async function (this, items, responseData) {
										let body = responseData.body as any;
										if (Buffer.isBuffer(body)) {
											body = JSON.parse(body.toString('utf-8'));
										} else if (typeof body === 'string') {
											body = JSON.parse(body);
										}

										const base64Image = body.image;
										const pose = { ...body };
										delete pose.image;

										const imageBuffer = Buffer.from(base64Image, 'base64');
										const binaryData = await this.helpers.prepareBinaryData(
											imageBuffer,
											'detected_pose.jpg',
											'image/jpeg',
										);
										return [
											{
												json: pose,
												binary: {
													data: binaryData,
												},
											},
										];
									},
								],
							},
						},
					},
					{
						name: 'Get Bin',
						value: 'getBin',
						routing: {
							request: {
								method: 'GET',
								url: 'http://host.docker.internal:8081/detect_bin',
								returnFullResponse: true,
							},
							output: {
								postReceive: [
									async function (this, items, responseData) {
										let body = responseData.body as any;
										if (Buffer.isBuffer(body)) {
											body = JSON.parse(body.toString('utf-8'));
										} else if (typeof body === 'string') {
											body = JSON.parse(body);
										}
										return [
											{
												json: body,
											},
										];
									},
								],
							},
						},
					},
				],
				default: 'getFrame',
			},
		],
	};
}
