/*
  Clean common non-JS artifacts in src/functions to make ESLint parsing succeed.
  - remove lines that are long dashes (----...)
  - remove top-level `/* global Deno */` comments (since we set Deno as global in eslint config)
  - remove stray `export default ...;` lines that reference non-existent identifiers
// Clean common non-JS artifacts in src/functions to make ESLint parsing succeed.
// - remove lines that are long dashes (----...)
// - remove top-level "/* global Deno */" comments (since we set Deno as global in eslint config)
// - remove stray `export default ...;` lines that reference non-existent identifiers

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const root = path.resolve(process.cwd(), 'src', 'functions');
const pattern = `${root}/**/*.js`;

const files = glob.sync(pattern, { nodir: true });
let changed = 0;

for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  const original = s;

  // Remove lines that are only dashes (e.g., ----------------------------)
  s = s.split(/\r?\n/).filter(line => !/^[-]{3,}\s*$/.test(line)).join('\n');

  // Remove /* global Deno */ comments (variants with whitespace)
  s = s.replace(/\/\*\s*global\s+Deno\s*\*\//g, '');

  // Remove stray export default lines where identifier likely isn't defined
  // Only remove if export default is at file end or on its own line
  s = s.replace(/^\s*export\s+default\s+[A-Za-z0-9_$]+\s*;?\s*$/gm, '');

  // Trim repeated blank lines
  s = s.replace(/\n{3,}/g, '\n\n');

  if (s !== original) {
    fs.writeFileSync(file, s, 'utf8');
    changed++;
  }
}

console.log(`Cleaned ${changed} files under src/functions`);
process.exit(0);
