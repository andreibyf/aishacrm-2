#!/usr/bin/env node
/* eslint-env node */
import { spawnSync } from "child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

function main() {
  const args = process.argv.slice(2);
  const fileFlagIdx = args.indexOf("--file");
  if (fileFlagIdx === -1 || !args[fileFlagIdx+1]) {
    console.error("usage: braid-adapter --file <source.braid> [--policy policy.json]");
    process.exit(2);
  }
  const file = args[fileFlagIdx+1];
  const polIdx = args.indexOf("--policy");
  let policyFile = null;
  if (polIdx > -1 && args[polIdx+1]) policyFile = args[polIdx+1];

  const checkArgs = ["tools/braid-check", file];
  if (policyFile) checkArgs.push("--policy", policyFile);
  const check = run("node", checkArgs);
  if (check.status !== 0) {
    process.stderr.write(check.stdout);
    process.exit(check.status);
  }

  const hir = run("node", ["tools/braid-hir", file]);
  if (hir.status !== 0) {
    process.stderr.write(hir.stderr || "hir failed\n");
    process.exit(hir.status);
  }
  process.stdout.write(hir.stdout);
}

main();
