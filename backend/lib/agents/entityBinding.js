/**
 * Authoritative entity binding for the SINGLE-ENTITY task worker.
 *
 * Background: an `aisha_task` is launched from one specific entity (the account/
 * contact/lead/opportunity the user was looking at), and `/api/tasks/from-intent`
 * carries that entity as `entity_type` + `entity_id`. When the task's tool call
 * attaches to an entity (create_note, create_activity), the model is asked to echo
 * that id into the tool's `entity_id` arg. Weak (lite-tier/3B) models can't reliably
 * do this — they emit a placeholder like "<account_id>", which the API rejects with
 * `invalid input syntax for type uuid`. The system already KNOWS the id, so we bind
 * it deterministically instead of trusting the model to copy it.
 *
 * IMPORTANT — scope: this is for the task worker ONLY. It must NOT be pushed into the
 * shared `executeBraidTool`, because AiSHA chat is multi-entity (one session can act
 * on any entity) and binding a single originating entity there would hijack legitimate
 * cross-entity operations. Hence this lives in the worker's dispatch path, gated on the
 * task having one originating entity.
 *
 * Safety rules:
 *   - No-op unless there is a VALID originating entity id (a real UUID).
 *   - Only acts on entity-attaching tools, or tools that already carry an `entity_id` arg.
 *   - PRESERVES a model-supplied valid UUID — including a legitimately different entity
 *     the worker looked up. Only a MISSING or non-UUID (placeholder) value is overridden.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Write tools reachable from the "Assign AiSHA a Task" modal that attach to the
// originating entity via entity_type/entity_id. Extend as new ones are added.
export const ENTITY_ATTACHING_TOOLS = new Set(['create_note', 'create_activity']);

/** True for a real UUID string (rejects "<account_id>", "", undefined, etc.). */
export function isValidUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * Bind the task's originating entity into a tool call's args when the model failed to
 * supply a valid entity_id. Returns a (possibly new) args object; never mutates input.
 *
 * @param {string} toolName
 * @param {Object} args                 - parsed tool-call arguments from the model
 * @param {string} originType           - originating entity_type (e.g. 'account')
 * @param {string} originId             - originating entity_id (UUID)
 * @returns {{ args: Object, bound: boolean }} bound=true if a substitution happened
 */
export function bindOriginatingEntity(toolName, args, originType, originId) {
  const safeArgs = args && typeof args === 'object' ? args : {};
  // No trustworthy origin → leave the model's args untouched.
  if (!isValidUuid(originId)) return { args: safeArgs, bound: false };

  const isAttaching = ENTITY_ATTACHING_TOOLS.has(toolName);
  const carriesEntityArg = Object.prototype.hasOwnProperty.call(safeArgs, 'entity_id');
  if (!isAttaching && !carriesEntityArg) return { args: safeArgs, bound: false };

  // Model supplied a real entity id (possibly a different entity it resolved) → keep it.
  if (isValidUuid(safeArgs.entity_id)) return { args: safeArgs, bound: false };

  // Missing or placeholder/invalid id → bind the authoritative originating entity.
  const modelType = safeArgs.entity_type;
  const keepModelType = typeof modelType === 'string' && !/[<>]/.test(modelType) && modelType.trim();
  return {
    args: {
      ...safeArgs,
      entity_id: originId,
      entity_type: keepModelType ? modelType : originType,
    },
    bound: true,
  };
}
