#!/usr/bin/env python3
import json, subprocess, sys

def run(cmd, input_bytes=None):
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE if input_bytes else None,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = p.communicate(input_bytes.decode() if isinstance(input_bytes, bytes) else input_bytes)
    return p.returncode, out, err

def apply_fixes(src:str, fixes:list)->str:
    inserts = []
    for f in fixes:
        edit = f.get("edit", {})
        if "insert" in edit and "at" in edit:
            inserts.append((int(edit["at"]), edit["insert"]))
    inserts.sort(key=lambda x:x[0], reverse=True)
    for pos, text in inserts:
        src = src[:pos] + text + src[pos:]
    return src

def check_and_fix(path:str)->int:
    with open(path,"r",encoding="utf-8") as f: src = f.read()
    rc, formatted, _ = run(["node","tools/braid-fmt"], input_bytes=src.encode("utf-8"))
    if rc==0 and formatted: src = formatted
    rounds = 0
    while rounds < 10:
        rounds += 1
        with open(path,"w",encoding="utf-8") as f: f.write(src)
        rc, out, _ = run(["node","tools/braid-check", path])
        if rc == 0:
            print(f"clean after {rounds} round(s)"); return 0
        fixes = []
        for line in out.splitlines():
            try:
                d = json.loads(line)
                fixes.extend(d.get("fixes", []))
            except json.JSONDecodeError:
                pass
        if not fixes:
            print(out); return 1
        src = apply_fixes(src, fixes)
    print("max rounds reached"); return 1

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: tools/llm_autofix.py <file.braid>"); sys.exit(2)
    sys.exit(check_and_fix(sys.argv[1]))
