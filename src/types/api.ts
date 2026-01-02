/**
 * Centralized API type definitions for AiSHA CRM
 * Eliminates `any` types across the codebase
 */

export interface ActionDescriptor {
  label?: string;
  type?: string;
  prompt?: string;
}

export interface ChatCommandResponse {
  status: 'success' | 'error';
  response?: string;
  message?: string;
  data?: {
    response?: string;
    message?: string;
    actions?: ActionDescriptor[];
  };
  actions?: ActionDescriptor[];
  data_summary?: string;
  mode?: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

export interface ChatCommandPayload {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  temperature?: number;
  tenantId?: string;
  entityContext?: {
    id: string;
    type: string;
    name: string;
  };
}
