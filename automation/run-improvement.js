import { execSync } from 'child_process';

function run(cmd, { allowFailure = false } = {}) {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    if (!allowFailure) throw err;
    console.warn(`⚠ Command exited non-zero (allowed): ${cmd}`);
  }
}

console.log('Running improvement agent...');

// lint:fix may exit non-zero for unfixable warnings — allow it
run('npm run lint:fix', { allowFailure: true });

run('npm run validate');

console.log('Improvement pass complete.');
