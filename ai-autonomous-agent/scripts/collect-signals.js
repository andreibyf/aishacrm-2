import fs from "fs"
import path from "path"

const configPath = "ai-autonomous-agent/config.json"

const defaultConfig = {
  repo_src_dir: "src",
  braid_tools_dir: "braid-llm-kit/examples/assistant",
  signals: {
    large_file_bytes: 10000,
    large_file_weight: 1,
    todo_weight: 1
  }
}

const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath))
  : defaultConfig

const roots = [
  config.repo_src_dir,
  "backend",
  config.braid_tools_dir,
  "tests"
].filter(Boolean)

let results = []

function walk(dir) {

  if (!fs.existsSync(dir)) return

  const files = fs.readdirSync(dir)

  for (const f of files) {

    const full = path.join(dir, f)
    const stat = fs.statSync(full)

    if (stat.isDirectory()) {

      if (
        !full.includes("node_modules") &&
        !full.includes(".git")
      ) walk(full)

      continue
    }

    const code = fs.readFileSync(full, "utf8")

    let score = 0

    if (stat.size > config.signals.large_file_bytes) {
      score += config.signals.large_file_weight
    }

    if (code.includes("TODO") || code.includes("FIXME")) {
      score += config.signals.todo_weight
    }

    results.push({
      file: full.replaceAll("\\","/"),
      score
    })
  }
}

roots.forEach(walk)

const outputDir = "ai-autonomous-agent/state"

fs.mkdirSync(outputDir, { recursive: true })

fs.writeFileSync(
  `${outputDir}/candidates.json`,
  JSON.stringify(results, null, 2)
)

console.log("Signals collected.")