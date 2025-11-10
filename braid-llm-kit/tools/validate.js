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
  // Capture entire optional effect list (allowing spaces) up to the next '{'
  const fnRegex = /fn\s+(\w+)\s*\([^)]*\)\s*->[^!{]*(?:!\s*([^{}]+))?/g;
  let m;
  while ((m = fnRegex.exec(src)) !== null) {
    const fnStart = m.index;
    const bodyStart = src.indexOf("{", fnStart);
    const bodyEnd = src.indexOf("}", bodyStart+1);
    const body = bodyStart>=0 && bodyEnd>bodyStart ? src.slice(bodyStart, bodyEnd) : "";
    const usesFs = /\bfs\./.test(body);
    if (usesFs && !(m[2] && m[2].split(',').map(s=>s.trim()).includes('fs'))) {
      const insertAt = fnStart + m[0].indexOf("->");
      push("BRAD104","error","unhandled effect: fs", fnStart, fnStart + (m[0].length), [
        {"label":"propagate with !fs","edit":{"insert":" !fs","at": insertAt + 2}}
      ]);
    }

    // policy enforcement on declared effects
    if (policy) {
      const effs = new Set();
      if (m[2]) m[2].split(',').map(s=>s.trim()).filter(Boolean).forEach(e=>effs.add(e));

      // Build allow/deny from policy; support either {allow,deny} arrays or {caps:{...}}
      const allowSet = new Set();
      const denySet = new Set();
      if (Array.isArray(policy.allow)) policy.allow.forEach(e=>allowSet.add(e));
      if (Array.isArray(policy.deny)) policy.deny.forEach(e=>denySet.add(e));
      if (allowSet.size===0 && !Array.isArray(policy.allow) && policy.caps) {
        if (policy.caps.fs !== undefined) allowSet.add("fs");
        if (policy.caps.net !== undefined) allowSet.add("net");
        if (policy.caps.time || policy.caps.clock !== undefined) allowSet.add("clock");
        if (policy.caps.rng !== undefined) allowSet.add("rng");
      }

      for (const e of effs) {
        if (denySet.has(e)) {
          push("BRAD201","error",`effect '${e}' not permitted by policy`, fnStart, fnStart+(m[0].length), []);
        } else if (allowSet.size>0 && !allowSet.has(e)) {
          push("BRAD201","error",`effect '${e}' not permitted by policy`, fnStart, fnStart+(m[0].length), []);
        }
      }
    }
  }
  return diags;
}
