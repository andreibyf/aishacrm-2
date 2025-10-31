import { ESLint } from 'eslint';
import fs from 'fs/promises';

async function fixUnusedVars() {
  const eslint = new ESLint({
    fix: false, // We'll apply suggestions manually
  });

  const results = await eslint.lintFiles(['**/*.{js,jsx}']);
  
  let totalFixed = 0;
  
  for (const result of results) {
    if (!result.messages || result.messages.length === 0) continue;
    
    const unusedVarMessages = result.messages.filter(
      msg => msg.ruleId === 'no-unused-vars' && msg.suggestions && msg.suggestions.length > 0
    );
    
    if (unusedVarMessages.length === 0) continue;
    
    console.log(`Processing ${result.filePath} (${unusedVarMessages.length} unused vars)`);
    
    let fileContent = await fs.readFile(result.filePath, 'utf8');
    
    // Sort by position (descending) to avoid offset issues
    const sortedMessages = unusedVarMessages.sort((a, b) => b.fix?.range[0] - a.fix?.range[0]);
    
    // Apply suggestions using the first suggestion's fix
    for (const message of sortedMessages) {
      if (message.suggestions && message.suggestions[0] && message.suggestions[0].fix) {
        const fix = message.suggestions[0].fix;
        const before = fileContent.substring(0, fix.range[0]);
        const after = fileContent.substring(fix.range[1]);
        fileContent = before + fix.text + after;
        totalFixed++;
      }
    }
    
    await fs.writeFile(result.filePath, fileContent, 'utf8');
  }
  
  console.log(`\nTotal unused variables/imports removed: ${totalFixed}`);
}

fixUnusedVars().catch(console.error);
