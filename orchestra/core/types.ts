// orchestra/core/types.ts

export type GoalType = "bugfix" | "feature";

export type AgentName = "backend" | "frontend" | "test";

export interface OrchestrationGoal {
  id: string;
  type: GoalType;
  title: string;
  description: string;
  /**
   * Optional hint about area, e.g. "auth", "campaign worker", "frontend:activities".
   */
  scopeHint?: string;
  /**
   * Optional list of file paths the user wants focused on.
   */
  targetFiles?: string[];
}

export interface Task {
  id: string;
  goalId: string;
  agent: AgentName;
  summary: string;
  detail: string;
  /**
   * Files this task should focus on.
   */
  targetFiles: string[];
  dependsOn?: string[];
}

export interface AgentContextPacket {
  task: Task;
  repoSnapshot: {
    files: { path: string; content: string }[];
  };
  interfaces: string;   // from interfaces.md
  conventions: string;  // from CONVENTIONS.md
}

export interface FilePatch {
  path: string;
  type: "create" | "replace";
  content: string;
}

export interface AgentOutput {
  taskId: string;
  notes: string;
  patches: FilePatch[];
  followUpTasks?: Task[];
}

export interface WavePlan {
  waveId: string;
  tasks: Task[];
}

export interface WaveResult {
  wave: WavePlan;
  agentOutputs: AgentOutput[];
  validation: ValidationResult;
}

export interface ValidationResult {
  success: boolean;
  testsRun: string[];
  errorMessage?: string;
  diffStats?: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}
