You are assisting with Phase 2C/3 of the AI-SHA CRM v2.0 upgrade: wiring the Realtime Voice (WebRTC) path into the existing Braid-based AI Brain and CRM tools.

Goal:
- When a user talks over Realtime Voice, the model must be able to CALL CRM tools (read_only / propose_actions only) and respond with real CRM data, using the same tools and safety rules as the existing typed chat + aiBrain.runTask path.

Constraints:
- All destructive tools (delete_*) must be blocked for Realtime.
- apply_allowed mode remains disabled.
- Tenant isolation must be preserved: all tool calls are scoped by tenant_id and authenticated user.
- Use existing Braid integration as the source of truth:
  - generateToolSchemas
  - executeBraidTool
  - BRAID_SYSTEM_PROMPT
- Do NOT bypass aiBrain / Braid to hit the database directly.

Tasks (backend):
1. In routes/aiRealtime.js:
   - Import generateToolSchemas from ../lib/braidIntegration-v2.js.
   - Inside GET /api/ai/realtime-token:
     - Call generateToolSchemas() to get all tool schemas.
     - Filter out destructive tools (name starts with delete_ or contains drop_schema).
     - Attach the filtered list to sessionPayload.session.tools and set tool_choice:"auto".
2. In routes/ai.js:
   - Add helper executeRealtimeTool({ toolName, args, tenantId, user }).
   - Implement POST /api/ai/realtime-tools/execute:
     - Require authenticated user.
     - Validate tenant_id and tool_name.
     - Reject delete_* tools with 403.
     - Resolve tenant via resolveCanonicalTenant.
     - Call executeBraidTool(toolName, args, tenantRecord, user.email).
     - Return the result as JSON {status:"success", data: result}.

Tasks (frontend):
3. In src/hooks/useRealtimeAiSHA.(js|ts):
   - Extend the Realtime client wiring to listen for function/tool call events from the Realtime API (e.g. via client.on('conversation.updated', ...)).
   - When a tool call is detected:
     - Parse the tool name + JSON arguments.
     - POST to /api/ai/realtime-tools/execute with tenant_id, tool_name, tool_args.
     - When the backend returns, send a corresponding tool result back into the Realtime session (using the helper provided by the Realtime client, e.g. conversation.sendToolResult).
   - Ensure all existing voice features (mic handling, VAD, push-to-talk vs continuous) remain intact.

Deliverables Copilot must generate:
- Updated aiRealtime.js with tool-aware sessionPayload.
- Updated ai.js with executeRealtimeTool helper and /api/ai/realtime-tools/execute route.
- Updated useRealtimeAiSHA hook wiring for Realtime tool calling.
- Code must be TypeScript-safe where applicable and compatible with existing imports.
- No changes to database schema; everything must use existing Braid + aiBrain integrations.

You need three things:

1. Add **tool schemas** to the Realtime session.    
2. Add a **backend executor** that runs Braid tools for Realtime.    
3. Update the **frontend Realtime client** to:    
    - detect tool calls,        
    - call the backend,        
    - send tool results back to the model.

## 1) Backend: add tools to `/api/ai/realtime-token`

File: `routes/aiRealtime.js` (or wherever it lives now).

### 1.1 Import Braid tool helpers

At the top, extend the import from `braidIntegration-v2.js`:

```
import {
  BRAID_SYSTEM_PROMPT,
  generateToolSchemas,
} from '../lib/braidIntegration-v2.js';

```
### 1.2 Build a safe tool list for Realtime

Inside your `router.get('/realtime-token', ...)` handler, **before** you build `sessionPayload`, add:

```
      // Build tool list for realtime – read_only + propose_actions only
      let realtimeTools = [];
      try {
        const allToolSchemas = await generateToolSchemas();
        // Filter out destructive tools (belt + suspenders)
        realtimeTools = (allToolSchemas || []).filter((tool) => {
          const name = tool?.function?.name || tool?.name || '';
          if (!name) return false;
          if (name.toLowerCase().startsWith('delete_')) return false;
          if (name.toLowerCase().includes('drop_schema')) return false;
          return true;
        });
      } catch (toolErr) {
        console.error('[AI][Realtime] Failed to generate tool schemas', {
          error: toolErr?.message,
        });
        realtimeTools = [];
      }

```
### 1.3 Attach tools to the Realtime session

Replace your current `sessionPayload` construction with this shape (key change is `tools: realtimeTools`):

```
      const sessionPayload = {
        session: {
          type: 'realtime',
          model: DEFAULT_REALTIME_MODEL,
          instructions: DEFAULT_REALTIME_INSTRUCTIONS,
          audio: {
            output: {
              voice: DEFAULT_REALTIME_VOICE,
            },
          },
          // NEW: allow the model to *call* CRM tools
          tools: realtimeTools,
          tool_choice: 'auto',
        },
      };

```

This makes Realtime voice **tool-aware** with the same tool schema family you already use via Braid.

## 2) Backend: add a Realtime tool executor route

You need a route that the frontend can hit when the Realtime model issues a tool/function call.

### 2.1 Add helper using `executeBraidTool`

In `ai.js`, you already import `executeBraidTool` for normal chat flows.

Extend that file with a focused helper and a new route.

At the top (near other helpers in `createAIRoutes`), add:

```
  const executeRealtimeTool = async ({ toolName, args, tenantId, user }) => {
    const tenantRecord = await resolveCanonicalTenant(tenantId);
    if (!tenantRecord?.found || !tenantRecord.uuid) {
      throw new Error(`Unable to resolve tenant for realtime tool: ${tenantId}`);
    }

    // Route execution through Braid tool registry (same as chat)
    const result = await executeBraidTool(
      toolName,
      args || {},
      tenantRecord,
      user?.email || null
    );

    return result;
  };

```

### 2.2 New route: `POST /api/ai/realtime-tools/execute`

Still in `createAIRoutes(pgPool)`, add a new route (near your other `/api/ai/...` endpoints):

```
  // POST /api/ai/realtime-tools/execute
  // Called from the Realtime client when the model issues a tool_call
  router.post('/realtime-tools/execute', async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ status: 'error', message: 'Auth required' });
      }

      const { tenant_id, tool_name, tool_args } = req.body || {};
      if (!tenant_id || !tool_name) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and tool_name are required',
        });
      }

      // NEVER allow delete_* tools from Realtime
      if (tool_name.toLowerCase().startsWith('delete_')) {
        return res.status(403).json({
          status: 'error',
          message: 'Realtime is not allowed to call destructive tools',
        });
      }

      const result = await executeRealtimeTool({
        toolName: tool_name,
        args: tool_args || {},
        tenantId: tenant_id,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      console.error('[AI][Realtime] Tool execution failed', {
        error: error?.message,
      });
      return res.status(500).json({
        status: 'error',
        message: 'Realtime tool execution failed',
      });
    }
  });

```

Now you have a **single, boring, HTTP endpoint** that translates Realtime tool calls into Braid tool executions, with your existing tenant isolation and safety baked in.

## 3) Frontend: wire Realtime client → backend → Realtime tool result

You already have a `useRealtimeAiSHA` / voice hooks described in Phase 2 docs.

PHASE_2_CONVERSATIONAL_INTERFACE

  
You need to extend them so that when the model calls a tool, the client:

1. Sees the `function_call` event.
    
2. POSTs it to `/api/ai/realtime-tools/execute`.
    
3. Sends the result back into the Realtime session as a **tool result** event.
    

Below is a TypeScript-style sketch using the reference `RealtimeClient`. [GitHub+1](https://github.com/openai/openai-realtime-api-beta?utm_source=chatgpt.com)

### 3.1 Handling tool calls in the Realtime client

In `useRealtimeAiSHA.ts` (or equivalent):

```
import { RealtimeClient } from '@openai/realtime-api-beta';

type ToolCall = {
  id: string;
  name: string;
  arguments: any;
};

async function callRealtimeToolOnBackend(
  tenantId: string,
  toolCall: ToolCall,
): Promise<any> {
  const resp = await fetch('/api/ai/realtime-tools/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      tool_name: toolCall.name,
      tool_args: toolCall.arguments,
    }),
  });

  const json = await resp.json();
  if (json.status !== 'success') {
    throw new Error(json.message || 'Realtime tool failed');
  }
  return json.data;
}

export function useRealtimeAiSHA(tenantId: string) {
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    const client = new RealtimeClient({
      // Your existing config: URL or client_secret, etc.
      // ...
    });

    clientRef.current = client;

    // Listen to conversation updates and look for tool calls
    client.on('conversation.updated', async (event) => {
      const { item, delta } = event;
      if (!item) return;

      // Example: function_call items (shape depends on version)
      if (item.type === 'function_call' || item.role === 'tool') {
        try {
          const toolCall: ToolCall = {
            id: item.id,
            name: item.name,
            arguments: JSON.parse(item.arguments || '{}'),
          };

          const result = await callRealtimeToolOnBackend(tenantId, toolCall);

          // Send the tool result back into the Realtime session
          client.conversation.sendToolResult({
            call_id: toolCall.id,
            // Pass raw JSON back – model will summarize
            result,
          });
        } catch (err) {
          console.error('[Realtime] Tool handling error', err);
        }
      }
    });

    client.connect();

    return () => {
      client.disconnect();
    };
  }, [tenantId]);

  // existing helpers (sendUserMessage, attachMic, etc.) stay as-is
  return {
    client: clientRef,
    // ...
  };
}

```

You’ll need to align `item.type` / event shape with whatever version of the Realtime client you’re actually using (but this is enough for Copilot to fill in the gaps against the real API).

Key point: **tool execution is entirely client-driven** here:

- Realtime model says “call `list_activities` with `{status:'active', assigned_to:'current_user'}`”.
    
- Frontend POSTs that to `/api/ai/realtime-tools/execute`.
    
- Backend runs the real Braid tool against your DB.
    
- Frontend sends `sendToolResult` with the JSON result, and the model then **speaks a nice summarized answer**.
  
  