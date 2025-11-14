import { BraidAdapter, BraidAdapterContext } from "../index";
import { BraidAction, BraidActionResult } from "../types";
import { resolveOpenAIKey } from "../../lib/supabase";

// Node 18+ provides a global fetch
declare const fetch: any;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function createChatCompletion(params: {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  apiKey: string;
}): Promise<{ status: string; content?: string; model?: string; usage?: any; error?: string }> {
  const { messages, model, temperature, apiKey } = params;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        status: "error",
        error: `OpenAI API error ${response.status}: ${text}`,
      };
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || "";

    return {
      status: "success",
      content,
      model: json.model,
      usage: json.usage,
    };
  } catch (err: any) {
    return {
      status: "error",
      error: err?.message ?? String(err),
    };
  }
}

export const LlmAdapter: BraidAdapter = {
  system: "llm",

  async handleAction(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult> {
    ctx.info("LLM adapter handling action", {
      actionId: action.id,
      verb: action.verb,
      resource: action.resource,
    });

    const kind = action.resource.kind.toLowerCase();

    if (kind !== "generate-json" && kind !== "generate_json") {
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "UNSUPPORTED_KIND",
        errorMessage: `LLM adapter only supports 'generate-json' kind, got "${action.resource.kind}"`,
      };
    }

    const payload = (action.payload || {}) as Record<string, unknown>;
    const metadata = (action.metadata || {}) as Record<string, unknown>;

    const prompt = String(payload.prompt || "");
    const schema = payload.schema || {};
    const context = payload.context || null;
    const model = String(payload.model || process.env.DEFAULT_OPENAI_MODEL || "gpt-4o-mini");
    const temperature = typeof payload.temperature === "number" ? payload.temperature : 0.2;
    const explicitKey = payload.api_key ? String(payload.api_key) : null;
    const tenantId = (metadata.tenant_id || metadata.tenantId || payload.tenant_id || payload.tenantId) as string | null;

    try {
      // Resolve API key
      const apiKey = await resolveOpenAIKey({ explicitKey, tenantId });
      if (!apiKey) {
        return {
          actionId: action.id,
          status: "error",
          resource: action.resource,
          errorCode: "MISSING_API_KEY",
          errorMessage: "OpenAI API key not configured (tenant integration, system settings, or explicit key required)",
        };
      }

      // Build messages
      const SYSTEM_INSTRUCTIONS = `You are a strict JSON generator. Produce ONLY valid JSON that exactly matches the provided JSON Schema.\n- Do not include any commentary or code fences.\n- If you are unsure, return the closest valid JSON.\n`;

      const userContentParts: string[] = [];
      if (prompt) userContentParts.push(String(prompt));

      if (context) {
        if (typeof context === "string") {
          userContentParts.push(context);
        } else if (Array.isArray(context)) {
          userContentParts.push(
            context.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).join("\n\n")
          );
        } else {
          userContentParts.push(JSON.stringify(context));
        }
      }

      if (schema && Object.keys(schema || {}).length) {
        userContentParts.push(`JSON Schema:\n${JSON.stringify(schema)}`);
      }

      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        { role: "user", content: userContentParts.join("\n\n") || "Generate JSON." },
      ];

      // Call OpenAI
      const result = await createChatCompletion({ messages, model, temperature, apiKey });

      if (result.status === "error") {
        return {
          actionId: action.id,
          status: "error",
          resource: action.resource,
          errorCode: "LLM_ERROR",
          errorMessage: result.error || "Unknown LLM error",
        };
      }

      // Parse JSON from response
      let jsonOut = null;
      try {
        jsonOut = JSON.parse(result.content || "null");
      } catch {
        // Try to extract JSON block heuristically
        const match = (result.content || "").match(/\{[\s\S]*\}\s*$/);
        if (match) {
          try {
            jsonOut = JSON.parse(match[0]);
          } catch {
            jsonOut = null;
          }
        }
      }

      return {
        actionId: action.id,
        status: "success",
        resource: action.resource,
        data: {
          json: jsonOut,
          raw: result.content,
          model: result.model,
          usage: result.usage,
        },
      };
    } catch (err: any) {
      ctx.error("LLM adapter error", { error: err?.message ?? String(err) });
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "LLM_ERROR",
        errorMessage: err?.message ?? String(err),
      };
    }
  },
};