#!/usr/bin/env node

/**
 * Local, non-hosted quality gate.
 *
 * This command intentionally uses public placeholders for the production
 * bundle check. It verifies repository code and built output without probing
 * a hosted Supabase project or requiring deployment credentials.
 */

import { spawnSync } from 'node:child_process';

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmPrefixArgs = npmExecPath ? [npmExecPath] : [];

function run(label, args, options = {}) {
  console.log(`quality: ${label}`);
  const result = spawnSync(npmCommand, [...npmPrefixArgs, ...args], {
    env: process.env,
    stdio: 'inherit',
    shell: !npmExecPath && process.platform === 'win32',
    ...options,
  });

  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`quality: ${label} failed (exit ${code})`);
    process.exit(code);
  }
}

run('format check', ['run', 'format:check']);
run('lint', ['run', 'lint']);
run('dashboard boundary', ['run', 'verify:dashboard-boundary']);
run('typecheck', ['run', 'typecheck']);
run('unit tests', ['test', '--', '--run']);
run('local AI environment tests', ['run', 'test:local-ai-env']);

const buildEnv = {
  ...process.env,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'https://api.example.invalid',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY:
    process.env.VITE_SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxdWFsaXR5LWNoZWNrIn0.quality-check-placeholder',
};

run('production build with public placeholders', ['run', 'build'], { env: buildEnv });
run('built environment scan', ['run', 'verify:built-env']);

console.log('quality: local checks passed; hosted checks remain outside this command.');
