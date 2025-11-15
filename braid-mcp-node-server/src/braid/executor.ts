import {
  BraidRequestEnvelope,
  BraidResponseEnvelope,
  BraidAction,
  BraidActionResult,
} from "./types";
import { BraidAdapterContext, BraidRegistry, createConsoleLogger } from "./index";
import { applyPoliciesBefore, applyPoliciesAfter, BraidPolicy, NoPolicies } from "./policy";

export interface BraidExecutorOptions {
  policies?: BraidPolicy[];
  logger?: BraidAdapterContext["log"];
}

export class BraidExecutor {
  private readonly registry: BraidRegistry;
  private readonly policies: BraidPolicy[];
  private readonly log: BraidAdapterContext["log"];

  constructor(registry: BraidRegistry, options: BraidExecutorOptions = {}) {
    this.registry = registry;
    this.policies = options.policies ?? NoPolicies;
    this.log = options.logger ?? createConsoleLogger();
  }

  private createContext(): BraidAdapterContext {
    return {
      log: this.log,
      debug: this.log.debug,
      info: this.log.info,
      warn: this.log.warn,
      error: this.log.error,
    };
  }

  async executeEnvelope(
    envelope: BraidRequestEnvelope
  ): Promise<BraidResponseEnvelope> {
    const startedAt = new Date().toISOString();
    const ctx = this.createContext();

    ctx.info("Executing Braid envelope", {
      requestId: envelope.requestId,
      actionCount: envelope.actions.length,
    });

    const results: BraidActionResult[] = [];

    for (const action of envelope.actions) {
      const actionWithRequestId: BraidAction = {
        ...action,
        metadata: {
          ...(action.metadata ?? {}),
          requestId: envelope.requestId,
        },
      };
      const result = await this.executeSingleAction(actionWithRequestId, ctx);
      results.push(result);
    }

    const finishedAt = new Date().toISOString();

    return {
      requestId: envelope.requestId,
      results,
      startedAt,
      finishedAt,
      metadata: {
        actorId: envelope.actor.id,
        client: envelope.client,
        channel: envelope.channel,
      },
    };
  }

  private async executeSingleAction(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult> {
    const { system } = action.resource;

    const adapter = this.registry.getAdapter(system);
    if (!adapter) {
      ctx.error("No adapter registered for system", { system });
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "NO_ADAPTER",
        errorMessage: `No adapter registered for system "${system}"`,
      };
    }

    try {
      const guardedAction = await applyPoliciesBefore(action, ctx, this.policies);
      const rawResult = await adapter.handleAction(guardedAction, ctx);
      const finalResult = await applyPoliciesAfter(rawResult, ctx, this.policies);
      return finalResult;
    } catch (err: any) {
      ctx.error("Error executing action", { error: err?.message ?? String(err) });
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "EXECUTION_ERROR",
        errorMessage: err?.message ?? String(err),
      };
    }
  }
}
