import fs from "fs"
import path from "path"

const config = JSON.parse(
  fs.readFileSync("ai-autonomous-agent/config.json")
)

const roots = [config.repo_src_dir, "backend", config.braid_tools_dir, "tests"]
  .filter(Boolean)
  .filter((dir, index, all) => all.indexOf(dir) === index)

let results = []

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").toLowerCase()
}

function detectSubsystem(filePath) {
  const p = normalizePath(filePath)

  if (p.includes("/backend/lib/braid") || p.includes("/tests/platform/")) return "PLATFORM"
  if (
    p.includes("/backend/flows") ||
    p.includes("/src/components/workflows/") ||
    p.includes("/tests/workflows/")
  ) return "WORKFLOWS"
  if (
    p.includes("/backend/care") ||
    p.includes("/backend/lib/care/") ||
    p.includes("/tests/care/")
  ) return "CARE"
  if (
    p.includes("/chat") ||
    p.includes("/src/components/ai/") ||
    p.includes("/src/ai/") ||
    p.includes("/src/__tests__/ai/") ||
    p.includes("/tests/aisha-chat/")
  ) return "AISHA_CHAT"
  if (p.includes("/reports") || p.includes("/tests/reports/")) return "REPORTS"
  if (
    p.includes("/crm/") ||
    p.includes("/tests/crm/") ||
    p.includes("/src/pages/") ||
    p.includes("/src/components/accounts/") ||
    p.includes("/src/components/contacts/") ||
    p.includes("/src/components/leads/") ||
    p.includes("/src/components/activities/") ||
    p.includes("/src/components/bizdev/") ||
    p.includes("/src/components/employees/")
  ) return "CRM"
  if (p.includes("/integrations") || p.includes("/tests/integrations/")) return "INTEGRATIONS"
  if (p.includes("/performance") || p.includes("/tests/performance/")) return "PERFORMANCE"

  return "GENERAL"
}

function walk(dir) {
  if (!fs.existsSync(dir)) return

  const files = fs.readdirSync(dir)

  for (const f of files) {
    const full = path.join(dir, f)
    const stat = fs.statSync(full)

    if (stat.isDirectory()) {
      if (!full.includes("node_modules") && !full.includes(".git")) {
        walk(full)
      }
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
      file: full,
      score,
      subsystem: detectSubsystem(full)
    })
  }
}

roots.forEach(walk)

fs.writeFileSync(
  "ai-autonomous-agent/state/candidates.json",
  JSON.stringify(results, null, 2)
)

console.log("Signals collected.")
