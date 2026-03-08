import fs from "fs";
import { execFileSync } from "child_process";

const baseStateDir = "ai-autonomous-agent/state";
const target = fs.readFileSync(`${baseStateDir}/target.txt`, "utf8").trim();
const subsystem = fs.readFileSync(`${baseStateDir}/subsystem.txt`, "utf8").trim() || "GENERAL";

if (!target) {
  console.error("No target file selected.");
  process.exit(1);
}

console.log("Target:", target);
console.log("Subsystem:", subsystem);

const prompt = `You are working inside the AiSHA CRM repository.

Target file:
${target}

Subsystem:
${subsystem}

Rules:
- preserve functionality
- make minimal safe improvements
- do not modify tenant isolation logic
- ensure tests pass
- keep changes small

Return a safe refactor suggestion.`;

fs.writeFileSync(`${baseStateDir}/codex-prompt.txt`, prompt);

console.log("Running Codex analysis...");
execFileSync("codex", ["exec", prompt], { stdio: "inherit" });

console.log("Launching Aider...");
const aiderArgs = [target];
if (process.env.AISHA_AIDER_AUTOCOMMIT === "1") {
  aiderArgs.push("--auto-commits", "--yes");
}
execFileSync("aider", aiderArgs, { stdio: "inherit" });
