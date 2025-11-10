// Minimal validator that enforces a few "Braid rules" for deterministic feedback.
// no fs needed here; keep module self-contained

export function validate(src, filename="input.braid", policy=null) {
  const diags = [];
  const push=(code,severity,message,start,end,fixes=[])=>diags.push({code,severity,message,span:{file:filename,start,end},fixes});

  if (!/\bfn\s+\w+\s*\(/.test(src)) {
    push("BRAD001","error","no function declarations found",0,0,[]);
  }

  const nullIdx = src.indexOf("null");
  if (nullIdx >= 0) {
    push("BRAD002","error","'null' is not allowed; use Option[T]", nullIdx, nullIdx+4,[]);
  }

  // crude effect check for fs and policy
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

    // policy enforcement on declared effects
    if (policy) {
      const effDecl = m[0].match(/!([^\s{]+)/);
      const effs = new Set();
      if (effDecl && effDecl[1]) {
        effDecl[1].split(",").map(s=>s.trim()).filter(Boolean).forEach(e=>effs.add(e));
      }
      // build allowed effects from policy
      const allowed = new Set();
      if (policy.caps) {
        if (policy.caps.fs !== undefined) allowed.add("fs");
        if (policy.caps.net !== undefined) allowed.add("net");
        if (policy.caps.time || policy.caps.clock !== undefined) allowed.add("clock");
        if (policy.caps.rng !== undefined) allowed.add("rng");
      }
      for (const e of effs) {
        if (allowed.size>0 && !allowed.has(e)) {
          push("BRAD201","error",`effect '${e}' not permitted by policy`, fnStart, fnStart+(m[0].length), []);
        }
      }
    }
  }
  return diags;
}
