export function format(src) {
  const lines = src.replace(/\t/g,"  ").split(/\r?\n/).map(l=>l.replace(/[ \t]+$/,""));
  let out = lines.join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.endsWith("\n") ? out : out + "\n";
}
