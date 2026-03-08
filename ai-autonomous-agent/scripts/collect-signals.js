import fs from "fs"
import path from "path"

const config=JSON.parse(
fs.readFileSync("ai-autonomous-agent/config.json")
)

const roots=[config.repo_src_dir,config.braid_tools_dir,"tests"]

const skipDirs=["node_modules",".git","dist","build","coverage"]

const skipExt=[".png",".jpg",".jpeg",".gif",".svg",".pdf"]

let results=[]

function walk(dir){

if(!fs.existsSync(dir))return

const files=fs.readdirSync(dir)

for(const f of files){

const full=path.join(dir,f)
const stat=fs.statSync(full)

if(stat.isDirectory()){

if(skipDirs.some(d=>full.includes(d)))continue

walk(full)
continue
}

if(skipExt.some(e=>full.endsWith(e)))continue

if(stat.size>500000)continue

const code=fs.readFileSync(full,"utf8")

let score=0

if(stat.size>config.signals.large_file_bytes)
score+=config.signals.large_file_weight

if(code.includes("TODO")||code.includes("FIXME"))
score+=config.signals.todo_weight

if(full.includes(config.braid_tools_dir))
score+=config.signals.braid_tool_weight

const dup=code.match(/\.map\(|\.filter\(|\.reduce\(/g)
if(dup && dup.length>10)score+=3

results.push({
file:full.replaceAll("\\","/"),
score
})

}

}

roots.forEach(walk)

results.sort((a,b)=>b.score-a.score)

fs.mkdirSync("ai-autonomous-agent/state",{recursive:true})

fs.writeFileSync(
"ai-autonomous-agent/state/candidates.json",
JSON.stringify(results,null,2)
)

console.log("Signals collected")