// Minimal validator that enforces a few "Braid rules" for deterministic feedback.
export function validate(src, filename="input.braid") {
  const diags = [];
  const push=(code,severity,message,start,end,fixes=[])=>diags.push({code,severity,message,span:{file:filename,start,end},fixes});

  if (!/\bfn\s+\w+\s*\(/.test(src)) {
    push("BRAD001","error","no function declarations found",0,0,[]);
  }

  const nullIdx = src.indexOf("null");
  if (nullIdx >= 0) {
    push("BRAD002","error","'null' is not allowed; use Option[T]", nullIdx, nullIdx+4,[]);
  }

  // crude effect check for fs
  const fnRegex = /fn\s+(\w+)\s*\([^)]*\)\s*->[^!{]*(![^\s{]+)?/g;
  let m;
  while ((m = fnRegex.exec(src)) !== null) {
    const fnStart = m.index;
    const bodyStart = src.indexOf("{", fnStart);
    const bodyEnd = src.indexOf("}", bodyStart+1);
    const body = bodyStart>=0 && bodyEnd>bodyStart ? src.slice(bodyStart, bodyEnd) : "";
    const usesFs = /\bfs\./.test(body);
    if (usesFs && !/!.*\bfs\b/.test(m[0])) {
      const insertAt = fnStart + m[0].indexOf("->");
      push("BRAD104","error","unhandled effect: fs", fnStart, fnStart + (m[0].length), [
        {"label":"propagate with !fs","edit":{"insert":" !fs","at": insertAt + 2}}
      ]);
    }
  }
  return diags;
}
