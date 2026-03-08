/* global process */
import fs from "fs"

const stateDir = "ai-autonomous-agent/state"
fs.mkdirSync(stateDir, { recursive: true })

const candidates = JSON.parse(
  fs.readFileSync(process.argv[2])
)

if (!candidates.length) {
  fs.writeFileSync(`${stateDir}/target.txt`, "")
  fs.writeFileSync(`${stateDir}/subsystem.txt`, "GENERAL")
  process.exit(0)
}

candidates.sort((a, b) => b.score - a.score)

const target = candidates[0]

fs.writeFileSync(
  `${stateDir}/target.txt`,
  target.file
)

fs.writeFileSync(
  `${stateDir}/subsystem.txt`,
  target.subsystem || "GENERAL"
)

console.log(target.file)
