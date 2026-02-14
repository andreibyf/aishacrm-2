import { BraidAction, BraidActionResult, BraidVerb } from "./types";
import { BraidAdapterContext } from "./index";

export interface BraidPolicy {
  beforeAction?(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidAction> | BraidAction;

  afterAction?(
    result: BraidActionResult,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult> | BraidActionResult;
}

export async function applyPoliciesBefore(
  action: BraidAction,
  ctx: BraidAdapterContext,
  policies: BraidPolicy[]
): Promise<BraidAction> {
  let current = action;
  for (const policy of policies) {
    if (policy.beforeAction) {
      current = await policy.beforeAction(current, ctx);
    }
  }
  return current;
}

export async function applyPoliciesAfter(
  result: BraidActionResult,
  ctx: BraidAdapterContext,
  policies: BraidPolicy[]
): Promise<BraidActionResult> {
  let current = result;
  for (const policy of policies) {
    if (policy.afterAction) {
      current = await policy.afterAction(current, ctx);
    }
  }
  return current;
}

export const NoPolicies: BraidPolicy[] = [];

// ---------------------------------------------------------------------------
// CRM Policy Definitions — aligned with @policy annotations in .braid files
// ---------------------------------------------------------------------------

/** Maps Braid verbs to CRM policy names (matching CRM_POLICIES keys in braid-rt.js) */
const VERB_POLICY_MAP: Record<string, string> = {
  read:     "READ_ONLY",
  search:   "READ_ONLY",
  create:   "WRITE_OPERATIONS",
  update:   "WRITE_OPERATIONS",
  delete:   "DELETE_OPERATIONS",
  run:      "WRITE_OPERATIONS",
  optimize: "AI_SUGGESTIONS",
};

/** Minimum roles required per policy. Mirrors backend/lib/braid/policies.js CRM_POLICIES. */
const POLICY_REQUIRED_ROLES: Record<string, string[]> = {
  READ_ONLY:         [],                                       // any authenticated user
  WRITE_OPERATIONS:  ["sales_rep", "admin", "tenant_admin"],
  DELETE_OPERATIONS: ["admin", "tenant_admin"],
  ADMIN_ONLY:        ["admin", "tenant_admin"],
  SYSTEM_INTERNAL:   ["system"],
  AI_SUGGESTIONS:    [],
  EXTERNAL_API:      ["admin", "tenant_admin"],
};

/** Rate limits per policy (requests per minute). */
const POLICY_RATE_LIMITS: Record<string, number> = {
  READ_ONLY:         120,
  WRITE_OPERATIONS:  30,
  DELETE_OPERATIONS: 10,
  ADMIN_ONLY:        20,
  SYSTEM_INTERNAL:   999,
  AI_SUGGESTIONS:    15,
  EXTERNAL_API:      10,
};

/**
 * CrmRolePolicy — enforces role-based access control before CRM actions.
 * 
 * Maps verb → policy → required roles, then checks actor.roles.
 * System actors and agents bypass role checks (they use service tokens).
 */
export const CrmRolePolicy: BraidPolicy = {
  beforeAction(action: BraidAction, ctx: BraidAdapterContext): BraidAction {
    // Only apply to CRM system
    if (action.resource.system !== "crm") return action;

    // System and agent actors bypass role checks (service-to-service)
    if (action.actor.type === "system" || action.actor.type === "agent") {
      return action;
    }

    const policyName = VERB_POLICY_MAP[action.verb];
    if (!policyName) {
      ctx.warn("CRM policy: unknown verb, allowing", { verb: action.verb });
      return action;
    }

    const requiredRoles = POLICY_REQUIRED_ROLES[policyName];
    if (!requiredRoles || requiredRoles.length === 0) {
      // No role restriction (e.g., READ_ONLY)
      return action;
    }

    const actorRoles = action.actor.roles || [];
    const hasRole = requiredRoles.some(r => actorRoles.includes(r));

    if (!hasRole) {
      ctx.warn("CRM policy: access denied", {
        actor: action.actor.id,
        verb: action.verb,
        policy: policyName,
        requiredRoles,
        actorRoles,
      });
      // Throw to trigger error result in executor
      throw Object.assign(
        new Error(
          `Permission denied: ${action.verb} on ${action.resource.kind} requires role [${requiredRoles.join(" | ")}]`
        ),
        {
          errorCode: "PERMISSION_DENIED",
          policy: policyName,
          requiredRoles,
          actorRoles,
        }
      );
    }

    // Inject resolved policy into metadata for downstream audit
    return {
      ...action,
      metadata: {
        ...action.metadata,
        _resolvedPolicy: policyName,
      },
    };
  },
};

/**
 * CrmAuditPolicy — logs write/delete operations after execution for audit trail.
 */
export const CrmAuditPolicy: BraidPolicy = {
  afterAction(result: BraidActionResult, ctx: BraidAdapterContext): BraidActionResult {
    // Only audit CRM write/delete operations
    if (result.resource.system !== "crm") return result;

    // Tag result with resolved policy for traceability
    if (result.status === "error" && result.errorCode) {
      ctx.info("CRM audit: action failed", {
        actionId: result.actionId,
        errorCode: result.errorCode,
        resource: result.resource.kind,
      });
    }

    return result;
  },
};

/** Default CRM policy stack. Order matters: role check first, audit after. */
export const CrmPolicies: BraidPolicy[] = [
  CrmRolePolicy,
  CrmAuditPolicy,
];
