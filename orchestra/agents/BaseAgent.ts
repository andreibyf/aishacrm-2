// orchestra/agents/BaseAgent.ts

import { AgentContextPacket, AgentOutput } from "../core/types";
import { callLLM } from "../core/llmClient";

export abstract class BaseAgent {
  abstract name: string;
  abstract roleSystemPrompt: string;

  async run(context: AgentContextPacket): Promise<AgentOutput> {
    const userPrompt = this.buildUserPrompt(context);
    const raw = await callLLM(this.roleSystemPrompt, userPrompt);

    try {
      const parsed = JSON.parse(raw);
      // Basic shape validation
      if (!parsed.taskId || !Array.isArray(parsed.patches)) {
        throw new Error("Missing required fields in AgentOutput");
      }
      return parsed as AgentOutput;
    } catch (err) {
      throw new Error(
        `Agent ${this.name} returned invalid JSON. Raw response:\n${raw}`
      );
    }
  }

  protected buildUserPrompt(context: AgentContextPacket): string {
    const filesSection = context.repoSnapshot.files
      .map(
        (f) =>
          `### File: ${f.path}\n` +
          "```ts\n" +
          f.content +
          "\n```"
      )
      .join("\n\n");

    const outputShape = {
      taskId: context.task.id,
      notes: "string",
      patches: [
        {
          path: "string",
          type: "create|replace",
          content: "string",
        },
      ],
      followUpTasks: [],
    };

    return [
      `Task: ${context.task.summary}`,
      "",
      `Detail: ${context.task.detail}`,
      "",
      "Conventions (must follow):",
      context.conventions,
      "",
      "Relevant interfaces and contracts:",
      context.interfaces,
      "",
      "Relevant files:",
      filesSection || "(no files provided; you may suggest files to inspect)",
      "",
      "Respond ONLY with JSON matching this shape (no markdown, no commentary):",
      JSON.stringify(outputShape, null, 2),
    ].join("\n");
  }
}
