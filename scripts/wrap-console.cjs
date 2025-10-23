const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('src/**/*.{js,jsx}', { ignore: ['**/node_modules/**', '**/dist/**'] });

let totalFixed = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Pattern 1: Standalone console statements (not already wrapped)
  content = content.replace(
    /^(\s*)(console\.(log|error|warn|info|debug)\([^;]+\);)(?!\s*})/gm,
    (match, indent, statement) => {
      // Check if already wrapped
      const lines = content.split('\n');
      const matchIndex = content.substring(0, content.indexOf(match)).split('\n').length - 1;
      const prevLine = lines[matchIndex - 1] || '';
      if (prevLine.includes('import.meta.env.DEV')) {
        return match; // Already wrapped
      }
      return `${indent}if (import.meta.env.DEV) {\n${indent}  ${statement}\n${indent}}`;
    }
  );
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalFixed++;
    console.log(`Fixed: ${file}`);
  }
});

console.log(`\nTotal files fixed: ${totalFixed}`);
