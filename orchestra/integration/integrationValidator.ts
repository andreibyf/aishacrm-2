// orchestra/integration/IntegrationValidator.ts

import { execSync } from "node:child_process";
import { ValidationResult } from "../core/types";

export class IntegrationValidator {
  constructor(
    private testCommand: string = "pnpm test",
    private buildCommand?: string
  ) {}

  runValidation(diffStats?: ValidationResult["diffStats"]): ValidationResult {
    const testsRun: string[] = [];
    try {
      if (this.buildCommand) {
        execSync(this.buildCommand, { stdio: "inherit" });
        testsRun.push(this.buildCommand);
      }
      execSync(this.testCommand, { stdio: "inherit" });
      testsRun.push(this.testCommand);

      return {
        success: true,
        testsRun,
        diffStats,
      };
    } catch (err: any) {
      return {
        success: false,
        testsRun,
        diffStats,
        errorMessage: err?.message ?? "Validation failed",
      };
    }
  }
}
