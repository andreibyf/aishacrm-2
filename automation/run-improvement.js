import { execSync } from 'child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

console.log('Running improvement agent...');

// placeholder for AI-driven improvement step
// in practice this can call Cursor CLI, OpenAI API, or a local agent

run('npm run lint:fix');

run('npm run validate');

console.log('Improvement pass complete.');
