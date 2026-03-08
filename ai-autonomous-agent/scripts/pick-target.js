import fs from "fs"
import process from "process"

const candidatesFile=process.argv[2]

const config=JSON.parse(
fs.readFileSync("ai-autonomous-agent/config.json")
)

const maxFiles=config.max_files_per_run || 5

const stateDir="ai-autonomous-agent/state"
const historyFile=`${stateDir}/recent-files.json`

const candidates=JSON.parse(fs.readFileSync(candidatesFile))

let history=[]

if(fs.existsSync(historyFile))
history=JSON.parse(fs.readFileSync(historyFile))

const filtered=candidates.filter(c=>!history.includes(c.file))

const targets=filtered.slice(0,maxFiles)

fs.writeFileSync(
`${stateDir}/targets.json`,
JSON.stringify(targets,null,2)
)

targets.forEach(t=>history.push(t.file))

history=history.slice(-100)

fs.writeFileSync(
historyFile,
JSON.stringify(history,null,2)
)

targets.forEach(t=>console.log(t.file))