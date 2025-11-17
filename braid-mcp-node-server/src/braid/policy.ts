import { BraidAction, BraidActionResult } from "./types";
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
