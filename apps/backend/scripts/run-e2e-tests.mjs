import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptsDirectory, '..');
const testsDirectory = path.resolve(scriptsDirectory, '../src/__tests__');
const testFiles = readdirSync(testsDirectory)
  .filter((file) => file.endsWith('.e2e.ts'))
  .sort();

if (testFiles.length === 0) {
  console.error('No E2E tests found.');
  process.exit(1);
}

for (const testFile of testFiles) {
  console.log(`\n>>> Running ${testFile}`);
  const result = spawnSync(
    process.execPath,
    ['--require', 'ts-node/register', path.join(testsDirectory, testFile)],
    {
      cwd: backendDirectory,
      stdio: 'inherit',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    }
  );

  if (result.error) {
    console.error(`Failed to start ${testFile}:`, result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`E2E test failed: ${testFile}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${testFiles.length} E2E tests passed.`);
