import type {
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class OpcUaApi implements ICredentialType {
	name = 'opcUaApi';

	displayName = 'OPC UA API';

	icon: Icon = { light: 'file:../nodes/OpcUa/opcua.svg', dark: 'file:../nodes/OpcUa/opcua.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint URL',
			name: 'endpointUrl',
			type: 'string',
			default: 'opc.tcp://localhost:4840',
			placeholder: 'opc.tcp://192.168.1.100:4840',
			required: true,
			description: 'The Connection Endpoint URL of the OPC UA Server',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'options',
			options: [
				{
					name: 'Anonymous',
					value: 'anonymous',
				},
				{
					name: 'Username & Password',
					value: 'usernamePassword',
				},
			],
			default: 'anonymous',
			description: 'The authentication method to use',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			displayOptions: {
				show: {
					authentication: ['usernamePassword'],
				},
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			displayOptions: {
				show: {
					authentication: ['usernamePassword'],
				},
			},
			default: '',
			required: true,
		},
	];
}
