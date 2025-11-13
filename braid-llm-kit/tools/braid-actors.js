"use strict";

export function mailbox() {
  const q = [];
  let notify = null;
  return {
    push(m) { q.push(m); if (notify) { notify(); notify = null; } },
    async pop() { if (q.length) return q.shift(); await new Promise(r => notify = r); return q.shift(); }
  };
}

export function spawn(handler, initialState) {
  const m = mailbox();
  let state = initialState;
  (async () => { for (;;) { const msg = await m.pop(); state = await handler(state, msg, m); } })();
  return {
    tell: (x) => m.push(x),
    ask:  (x, k = v => v) => new Promise(res => m.push({ ...x, __reply: v => res(k(v)) }))
  };
}
