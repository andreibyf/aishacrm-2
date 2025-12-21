#!/usr/bin/env python3
import os, sys, json, http.client, subprocess

SYSTEM = "You write Braid code. Rules: no nulls, use Option/Result and '?', declare effects after '!', explicit capabilities."
USER_TMPL = "Task: {task}\nInput: {input}\nReturn a single .braid file that compiles under braid-check."

def llm(prompt:str)->str:
    host = "api.openai.com"
    conn = http.client.HTTPSConnection(host, 443, timeout=30)
    body = json.dumps({"model":"gpt-4.1-mini","messages":[{"role":"system","content":SYSTEM},{"role":"user","content":prompt}],"temperature":0.2})
    headers = {"Authorization":f"Bearer {os.environ.get('OPENAI_API_KEY','')}", "Content-Type":"application/json"}
    conn.request("POST","/v1/chat/completions", body, headers)
    resp = conn.getresponse()
    data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]

def strip_fences(s:str)->str:
    if "```" not in s: return s
    parts = s.split("```")
    if len(parts)>=2:
        code = parts[1]
        if code.startswith("braid"): code = code[len("braid"):]
        return code.strip()
    return s

def main():
    if len(sys.argv) < 3:
        print("usage: tools/agent_stub.py <task text> <out.braid> [input-json]")
        sys.exit(2)
    task, out = sys.argv[1], sys.argv[2]
    input_json = sys.argv[3] if len(sys.argv)>3 else "{}"
    prompt = USER_TMPL.format(task=task, input=input_json)
    code = strip_fences(llm(prompt))
    open(out,"w",encoding="utf-8").write(code)
    fmt = subprocess.run(["node","tools/braid-fmt"], input=code.encode(), capture_output=True)
    open(out,"w",encoding="utf-8").write(fmt.stdout.decode())
    chk = subprocess.run(["node","tools/braid-check", out], capture_output=True, text=True)
    print(chk.stdout, end="")
    sys.exit(chk.returncode)

if __name__ == "__main__": main()
