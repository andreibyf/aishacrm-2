import fs from "fs"

const candidates = JSON.parse(
  fs.readFileSync(process.argv[2])
)

if (!candidates.length) {
  fs.writeFileSync("ai-autonomous-agent/state/target.txt", "")
  fs.writeFileSync("ai-autonomous-agent/state/subsystem.txt", "GENERAL")
  process.exit(0)
}

candidates.sort((a, b) => b.score - a.score)

const target = candidates[0]

fs.writeFileSync(
  "ai-autonomous-agent/state/target.txt",
  target.file
)

fs.writeFileSync(
  "ai-autonomous-agent/state/subsystem.txt",
  target.subsystem || "GENERAL"
)

console.log(target.file)
