#!/usr/bin/env node
/**
 * Release gate: unit tests, production build, built-env scan, then hosted
 * function allowlist when deployment credentials are present.
 *
 * Missing SUPABASE_ACCESS_TOKEN skips the allowlist with a visible report.
 * A skip is not a hosted allowlist pass.
 */

import { spawnSync } from 'node:child_process';

function run(label, command, args) {
  console.log(`verify:release: ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`verify:release: ${label} failed (exit ${code})`);
    process.exit(code);
  }
}

run('tests', 'npm', ['test']);
run('claims tests', 'node', ['--test', 'scripts/validate-claims.test.mjs']);
run('claims', 'npm', ['run', 'validate:claims']);
run('pitch claims', 'npm', ['run', 'validate:pitch']);
run('submission artifact tests', 'node', ['--test', 'scripts/validate-submission-package.test.mjs']);
run('submission artifacts', 'npm', ['run', 'validate:submission']);
run('pilot evidence tests', 'node', ['--test', 'scripts/validate-pilot-results.test.mjs']);
run('pilot template', 'npm', ['run', 'validate:pilot']);
run('pilot summary template', 'npm', ['run', 'summarize:pilot']);
run('production build', 'npm', ['run', 'build']);
run('built-env scan', 'node', ['scripts/verify-built-env.mjs', 'dist']);

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.log('verify:release: hosted function allowlist SKIPPED');
  console.log('Reason: SUPABASE_ACCESS_TOKEN is not set.');
  console.log(
    'This is not a hosted allowlist pass. Do not treat this skip as verify:functions success.',
  );
  process.exit(0);
}

run('hosted function allowlist', 'npm', ['run', 'verify:functions']);
console.log('verify:release: hosted function allowlist passed');
