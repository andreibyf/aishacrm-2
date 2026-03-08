/* global process */
import fs from "fs";
import { spawnSync, execFileSync } from "child_process";

const baseStateDir = "ai-autonomous-agent/state";

const target = fs.readFileSync(`${baseStateDir}/target.txt`, "utf8").trim();
const subsystem =
  fs.readFileSync(`${baseStateDir}/subsystem.txt`, "utf8").trim() || "GENERAL";

if (!target) {
  console.error("No target file selected.");
  process.exit(1);
}

const riskFile = `${baseStateDir}/risk.json`

if (fs.existsSync(riskFile)) {
  const risk = JSON.parse(fs.readFileSync(riskFile))

  if (risk.blocked) {
    console.log("Skipping target due to risk scan.")
    process.exit(0)
  }
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
- do not modify auth or permissions
- ensure tests pass
- keep changes small
- prefer helper extraction or dead code removal

Return JSON:

{
  "risk_summary": "...",
  "change_type": "...",
  "files_touched": [],
  "safe": true
}
`;


fs.writeFileSync(`${baseStateDir}/codex-prompt.txt`, prompt);

console.log("Running Codex analysis...");

const codexResult = spawnSync(
  "bash",
  ["-c", `cat ${baseStateDir}/codex-prompt.txt | codex exec`],
  {
    stdio: "inherit",
    env: process.env
  }
);

if (codexResult.error) {
  console.error("Failed to launch Codex:", codexResult.error.message);
  process.exit(1);
}

console.log("Launching Aider...");

const aiderArgs = [target];

if (process.env.AISHA_AIDER_AUTOCOMMIT === "1") {
  aiderArgs.push("--auto-commits", "--yes");
}

execFileSync("aider", aiderArgs, {
  stdio: "inherit",
  env: process.env
});