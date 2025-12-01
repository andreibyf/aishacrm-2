/// <reference types="vite/client" />

declare module '@/api/functions' {
  export function processChatCommand(payload: unknown): Promise<{ status: number; data: any }>;
}
