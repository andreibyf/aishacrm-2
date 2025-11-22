// orchestra/context/AgentContextHub.ts

import { AgentContextPacket, Task } from "../core/types";
import { readFileSafe } from "../core/fileOps";

export class AgentContextHub {
  constructor(
    private interfacesPath = "orchestra/context/interfaces.md",
    private conventionsPath = "orchestra/CONVENTIONS.md"
  ) {}

  buildContext(task: Task): AgentContextPacket {
    const files = task.targetFiles
      .map((p) => {
        const content = readFileSafe(p);
        return content ? { path: p, content } : null;
      })
      .filter(Boolean) as { path: string; content: string }[];

    const interfaces =
      readFileSafe(this.interfacesPath) ??
      "No interfaces.md found. Keep assumptions minimal.";
    const conventions =
      readFileSafe(this.conventionsPath) ??
      "No CONVENTIONS.md found. Default to minimal diff and bugfix-first.";

    return {
      task,
      repoSnapshot: { files },
      interfaces,
      conventions,
    };
  }
}
