import fs from "fs"
import process from "process"
import { spawnSync, execFileSync } from "child_process"

const baseStateDir="ai-autonomous-agent/state"
const promptsDir="ai-autonomous-agent/prompts"

const target=fs.readFileSync(`${baseStateDir}/target.txt`,"utf8").trim()

if(!target){
console.log("No target")
process.exit(0)
}

const riskFile=`${baseStateDir}/risk.json`

if(fs.existsSync(riskFile)){
const risk=JSON.parse(fs.readFileSync(riskFile))
if(risk.blocked){
console.log("Blocked by risk scan")
process.exit(0)
}
}

let promptFile="refactor.txt"

if(fs.existsSync(`${baseStateDir}/test-failed.txt`))
promptFile="testfix.txt"

if(target.includes("braid"))
promptFile="braid.txt"

const promptTemplate=fs.readFileSync(`${promptsDir}/${promptFile}`,"utf8")

const prompt=`
${promptTemplate}

Target file:
${target}
`

fs.writeFileSync(`${baseStateDir}/codex-prompt.txt`,prompt)

const result=spawnSync(
"bash",
["-c",`cat ${baseStateDir}/codex-prompt.txt | codex exec`],
{
stdio:"inherit",
timeout:600000
}
)

if(result.status!==0){
process.exit(1)
}

execFileSync("aider",[target],{stdio:"inherit"})