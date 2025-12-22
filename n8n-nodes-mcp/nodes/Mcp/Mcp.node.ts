import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Mcp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Braid MCP Server',
		name: 'mcp',
		icon: 'file:mcp.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with Braid Model Context Protocol (MCP) server',
		defaults: {
			name: 'Braid MCP Server',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [],
		properties: [
			{
				displayName: 'MCP Server URL',
				name: 'mcpServerUrl',
				type: 'string',
				default: 'http://braid-mcp-node-server:8000',
				required: true,
				description: 'The URL of your MCP server',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'CRM',
						value: 'crm',
					},
					{
						name: 'Custom Prompt',
						value: 'prompt',
					},
				],
				default: 'crm',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['crm'],
					},
				},
				options: [
					{
						name: 'List Contacts',
						value: 'listContacts',
						action: 'List contacts',
						description: 'Retrieve all contacts from CRM',
					},
					{
						name: 'Get Contact',
						value: 'getContact',
						action: 'Get a contact',
						description: 'Get a specific contact by ID',
					},
					{
						name: 'Create Contact',
						value: 'createContact',
						action: 'Create a contact',
						description: 'Create a new contact',
					},
					{
						name: 'List Accounts',
						value: 'listAccounts',
						action: 'List accounts',
						description: 'Retrieve all accounts from CRM',
					},
					{
						name: 'List Leads',
						value: 'listLeads',
						action: 'List leads',
						description: 'Retrieve all leads from CRM',
					},
					{
						name: 'List Opportunities',
						value: 'listOpportunities',
						action: 'List opportunities',
						description: 'Retrieve all opportunities from CRM',
					},
				],
				default: 'listContacts',
			},
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['crm'],
						operation: ['getContact'],
					},
				},
				default: '',
				required: true,
				description: 'The ID of the contact to retrieve',
			},
			{
				displayName: 'Contact Data',
				name: 'contactData',
				type: 'json',
				displayOptions: {
					show: {
						resource: ['crm'],
						operation: ['createContact'],
					},
				},
				default: '{\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "tenant_id": "6cb4c008-4847-426a-9a2e-918ad70e7b69"\n}',
				required: true,
				description: 'Contact data as JSON object',
			},
			{
				displayName: 'Tenant ID',
				name: 'tenantId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['crm'],
						operation: ['listContacts', 'listAccounts', 'listLeads', 'listOpportunities'],
					},
				},
				default: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
				required: true,
				description: 'The tenant ID to filter by',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['prompt'],
					},
				},
				default: '',
				required: true,
				description: 'Send a custom prompt to the MCP server',
				typeOptions: {
					rows: 4,
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const mcpServerUrl = this.getNodeParameter('mcpServerUrl', i) as string;
				const resource = this.getNodeParameter('resource', i) as string;

				let endpoint = '';
				let method = 'GET';
				let body: any = undefined;

				if (resource === 'crm') {
					const operation = this.getNodeParameter('operation', i) as string;
					const tenantId = this.getNodeParameter('tenantId', i, '') as string;

					switch (operation) {
						case 'listContacts':
							endpoint = '/api/contacts';
							if (tenantId) {
								endpoint += `?tenant_id=${encodeURIComponent(tenantId)}`;
							}
							break;

						case 'getContact':
							const contactId = this.getNodeParameter('contactId', i) as string;
							endpoint = `/api/contacts/${encodeURIComponent(contactId)}`;
							if (tenantId) {
								endpoint += `?tenant_id=${encodeURIComponent(tenantId)}`;
							}
							break;

						case 'createContact':
							endpoint = '/api/contacts';
							method = 'POST';
							const contactData = this.getNodeParameter('contactData', i) as string;
							body = JSON.parse(contactData);
							break;

						case 'listAccounts':
							endpoint = '/api/accounts';
							if (tenantId) {
								endpoint += `?tenant_id=${encodeURIComponent(tenantId)}`;
							}
							break;

						case 'listLeads':
							endpoint = '/api/leads';
							if (tenantId) {
								endpoint += `?tenant_id=${encodeURIComponent(tenantId)}`;
							}
							break;

						case 'listOpportunities':
							endpoint = '/api/opportunities';
							if (tenantId) {
								endpoint += `?tenant_id=${encodeURIComponent(tenantId)}`;
							}
							break;

						default:
							throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
					}
				} else if (resource === 'prompt') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					endpoint = '/mcp/prompt';
					method = 'POST';
					body = { prompt };
				}

				const url = `${mcpServerUrl}${endpoint}`;
				const options: any = {
					method,
					headers: {
						'Content-Type': 'application/json',
					},
				};

				if (body) {
					options.body = JSON.stringify(body);
				}

				const response = await this.helpers.request(url, options);

				returnData.push({
					json: typeof response === 'string' ? JSON.parse(response) : response,
					pairedItem: i,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: i,
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
