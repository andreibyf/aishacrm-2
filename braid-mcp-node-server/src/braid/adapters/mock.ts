import { BraidAdapter, BraidAdapterContext } from "../index";
import { BraidActionResult } from "../types";

export const MockAdapter: BraidAdapter = {
  system: "mock",

  async handleAction(action, ctx: BraidAdapterContext): Promise<BraidActionResult> {
    ctx.debug("MockAdapter handling action", { actionId: action.id, verb: action.verb });

    const base: BraidActionResult = {
      actionId: action.id,
      status: "success",
      resource: action.resource,
    };

    return {
      ...base,
      data: {
        echo: true,
        action,
        note: "Mock adapter – replace with real system adapter.",
      },
    };
  },
};
