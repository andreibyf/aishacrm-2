#!/usr/bin/env ts-node

import { WaveOrchestrator } from "./WaveOrchestrator";
import { OrchestrationGoal, GoalType } from "../core/types";

function parseArgs(argv: string[]): {
  type: GoalType;
  title: string;
  description: string;
  scopeHint?: string;
  targetFiles: string[];
} {
  // Usage:
  // ts-node orchestra/orchestrator/runGoal.ts bugfix "Title" "Description" --scope="auth" src/file1.ts src/file2.ts
  const args = argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: runGoal <bugfix|feature> \"Title\" \"Description\" [--scope=hint] [targetFiles...]"
    );
    process.exit(1);
  }

  const typeArg = args[0] as GoalType;
  if (typeArg !== "bugfix" && typeArg !== "feature") {
    console.error('First argument must be "bugfix" or "feature".');
    process.exit(1);
  }

  const title = args[1];
  const description = args[2] ?? title;

  let scopeHint: string | undefined;
  const targetFiles: string[] = [];

  for (const arg of args.slice(3)) {
    if (arg.startsWith("--scope=")) {
      scopeHint = arg.replace("--scope=", "");
    } else {
      targetFiles.push(arg);
    }
  }

  return {
    type: typeArg,
    title,
    description,
    scopeHint,
    targetFiles,
  };
}

async function main() {
  const parsed = parseArgs(process.argv);

  const goal: OrchestrationGoal = {
    id: `goal-${Date.now()}`,
    type: parsed.type,
    title: parsed.title,
    description: parsed.description,
    scopeHint: parsed.scopeHint,
    targetFiles: parsed.targetFiles,
  };

  const orchestrator = new WaveOrchestrator();
  const waves = orchestrator.planWaves(goal);

  for (const wave of waves) {
    console.log(`Running wave ${wave.waveId} for goal "${goal.title}"...`);
    const result = await orchestrator.runWave(wave);

    console.log("Agent outputs:");
    console.log(JSON.stringify(result.agentOutputs, null, 2));

    console.log("Validation result:");
    console.log(JSON.stringify(result.validation, null, 2));

    if (!result.validation.success) {
      console.error("Validation failed. Stop here and review.");
      process.exit(1);
    }
  }

  console.log("All waves completed and validated successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
