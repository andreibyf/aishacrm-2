// orchestra/orchestrator/WaveOrchestrator.ts

import {
  AgentName,
  AgentOutput,
  OrchestrationGoal,
  Task,
  WavePlan,
  WaveResult,
} from "../core/types";
import { AgentContextHub } from "../context/AgentContextHub";
import { BackendAgent } from "../agents/BackendAgent";
import { FrontendAgent } from "../agents/FrontendAgent";
import { TestAgent } from "../agents/TestAgent";
import { applyPatches } from "../core/fileOps";
import { IntegrationValidator } from "../integration/IntegrationValidator";

export class WaveOrchestrator {
  private contextHub = new AgentContextHub();
  private validator = new IntegrationValidator();

  private agents: Record<AgentName, any> = {
    backend: new BackendAgent(),
    frontend: new FrontendAgent(),
    test: new TestAgent(),
  };

  /**
   * Basic wave planner.
   * - For bugfix: backend + test by default (frontend optional).
   * - For feature: backend + frontend + test.
   * You can extend this to use LLM planning later.
   */
  planWaves(goal: OrchestrationGoal): WavePlan[] {
    const baseTargetFiles = goal.targetFiles ?? [];

    const tasks: Task[] = [];

    // Backend task if scope suggests backend or unspecified
    tasks.push({
      id: `${goal.id}-backend`,
      goalId: goal.id,
      agent: "backend",
      summary: `[${goal.type}] ${goal.title} – backend`,
      detail: goal.description,
      targetFiles: baseTargetFiles,
    });

    // Frontend task for features or when scopeHint mentions frontend
    if (
      goal.type === "feature" ||
      (goal.scopeHint && goal.scopeHint.toLowerCase().includes("frontend"))
    ) {
      tasks.push({
        id: `${goal.id}-frontend`,
        goalId: goal.id,
        agent: "frontend",
        summary: `[${goal.type}] ${goal.title} – frontend`,
        detail: goal.description,
        targetFiles: baseTargetFiles,
      });
    }

    // Test task depends on others
    tasks.push({
      id: `${goal.id}-tests`,
      goalId: goal.id,
      agent: "test",
      summary: `[${goal.type}] ${goal.title} – tests`,
      detail: goal.description,
      targetFiles: baseTargetFiles,
      dependsOn: tasks.map((t) => t.id).filter((id) => !id.endsWith("-tests")),
    });

    return [
      {
        waveId: `${goal.id}-wave-1`,
        tasks,
      },
    ];
  }

  async runWave(wave: WavePlan): Promise<WaveResult> {
    const agentOutputs: AgentOutput[] = [];
    let cumulativeDiff = { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };

    // Run tasks sequentially to keep it simple and predictable.
    for (const task of wave.tasks) {
      const agent = this.agents[task.agent];
      if (!agent) {
        throw new Error(`No agent registered for ${task.agent}`);
      }

      const ctx = this.contextHub.buildContext(task);
      const result: AgentOutput = await agent.run(ctx);

      const stats = applyPatches(result.patches);
      cumulativeDiff.filesChanged += stats.filesChanged;
      cumulativeDiff.linesAdded += stats.linesAdded;
      cumulativeDiff.linesRemoved += stats.linesRemoved;

      agentOutputs.push(result);
    }

    const validation = this.validator.runValidation({
      filesChanged: cumulativeDiff.filesChanged,
      linesAdded: cumulativeDiff.linesAdded,
      linesRemoved: cumulativeDiff.linesRemoved,
    });

    return {
      wave,
      agentOutputs,
      validation,
    };
  }
}
