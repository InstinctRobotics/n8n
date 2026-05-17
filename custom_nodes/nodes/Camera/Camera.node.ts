import { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class Camera implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Camera',
		name: 'camera',
		icon: 'file:camera.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Controllo Camera (Get Frame and Get Pose)',
		defaults: {
			name: 'Camera',
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
							},
						},
					},
				],
				default: 'getFrame',
			},
		],
	};
}
