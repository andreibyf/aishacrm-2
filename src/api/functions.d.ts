export declare function processChatCommand(opts: {
  message?: string;
  text?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  tenantId?: string;
  tenant_id?: string;
  userTenantId?: string;
  model?: string;
  temperature?: number;
  api_key?: string;
  conversation_id?: string;
  conversationId?: string;
  sessionEntities?: unknown;
  entityContext?: unknown;
  timezone?: string;
}): Promise<{ status: number; data: unknown }>;

export declare function processDeveloperCommand(opts: Record<string, unknown>): Promise<{ status: number; data: unknown }>;
export declare function syncDatabase(...args: unknown[]): Promise<unknown>;
export declare function n8nCreateLead(...args: unknown[]): Promise<unknown>;
export declare function n8nCreateContact(...args: unknown[]): Promise<unknown>;
export declare function n8nGetData(...args: unknown[]): Promise<unknown>;
export declare function makeCall(...args: unknown[]): Promise<unknown>;
export declare function callStatus(...args: unknown[]): Promise<unknown>;
export declare function thoughtlyCallResults(...args: unknown[]): Promise<unknown>;
