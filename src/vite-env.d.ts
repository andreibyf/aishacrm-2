/// <reference types="vite/client" />

import type { ChatCommandResponse, ApiResponse } from '@/types/api';

declare module '@/api/functions' {
  export function processChatCommand(payload: unknown): Promise<ApiResponse<ChatCommandResponse>>;
}

// Global type augmentation for test setup
interface Window {
  __DISABLE_GLOBAL_FETCH_STUB?: boolean;
}
