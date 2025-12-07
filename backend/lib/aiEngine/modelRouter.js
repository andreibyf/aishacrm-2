/**
 * Central LLM model selection logic.
 * Each “capability” maps to a model tier.
 *
 * This is model-name focused. Provider selection is handled separately
 * (e.g. OpenAI, Groq, local OpenAI-compatible server).
 */

export function pickModel({ capability, override } = {}) {
  if (override) return override;

  switch (capability) {
    case "chat_light":
      return (
        process.env.MODEL_CHAT_LIGHT ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o-mini"
      );

    case "chat_tools":
      return (
        process.env.MODEL_CHAT_TOOLS ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o"
      );

    case "json_strict":
      return process.env.MODEL_JSON_STRICT || "gpt-4o-mini";

    case "realtime_voice":
      return (
        process.env.MODEL_REALTIME_VOICE ||
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-4o-realtime-preview-2024-12-17"
      );

    case "brain_read_only":
      return (
        process.env.MODEL_BRAIN_READ_ONLY ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o"
      );

    case "brain_plan_actions":
      return (
        process.env.MODEL_BRAIN_PLAN_ACTIONS ||
        process.env.MODEL_CHAT_TOOLS ||
        process.env.DEFAULT_OPENAI_MODEL ||
        "gpt-4o"
      );

    default:
      return process.env.DEFAULT_OPENAI_MODEL || "gpt-4o";
  }
}
