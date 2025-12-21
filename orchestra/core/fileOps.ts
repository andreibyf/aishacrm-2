// orchestra/core/fileOps.ts

import fs from "node:fs";
import path from "node:path";
import { FilePatch } from "./types";

const ROOT = process.cwd();

/**
 * Top-level directories the orchestrator is allowed to modify.
 * Adjust as needed.
 */
const ALLOWED_ROOTS = ["src", "backend", "tests", "orchestra"];

function ensureAllowed(relPath: string) {
  const normalized = relPath.replace(/\\/g, "/");
  const top = normalized.split("/")[0];
  if (!ALLOWED_ROOTS.includes(top)) {
    throw new Error(`Write outside allowed roots is forbidden: ${relPath}`);
  }
}

export function readFileSafe(relPath: string): string | null {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function writeFileSafe(relPath: string, contents: string): void {
  ensureAllowed(relPath);
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, "utf8");
}

/**
 * Applies a list of patches. Returns basic diff stats.
 */
export function applyPatches(patches: FilePatch[]): {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
} {
  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const patch of patches) {
    const prev = readFileSafe(patch.path);
    writeFileSafe(patch.path, patch.content);
    filesChanged += 1;

    const newLines = patch.content.split("\n").length;
    const oldLines = prev ? prev.split("\n").length : 0;
    if (newLines >= oldLines) {
      linesAdded += newLines - oldLines;
    } else {
      linesRemoved += oldLines - newLines;
    }
  }

  return { filesChanged, linesAdded, linesRemoved };
}
