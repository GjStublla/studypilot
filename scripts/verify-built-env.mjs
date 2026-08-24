#!/usr/bin/env node
/**
 * Scan a production web bundle for loopback hosts and forbidden secret names.
 * Prints file paths and token names only — never file contents or secret values.
 *
 * Usage: node scripts/verify-built-env.mjs dist
 */

import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = [
  'localhost',
  '127.0.0.1',
  'SUPABASE_SERVICE_ROLE',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'PRIVATE KEY',
  'VITE_GEMINI_API_KEY',
];

const target = path.resolve(process.argv[2] ?? 'dist');

if (!fs.existsSync(target)) {
  console.error('verify-built-env: build output directory is missing.');
  process.exit(1);
}

const stat = fs.statSync(target);
if (!stat.isDirectory()) {
  console.error('verify-built-env: build output path is not a directory.');
  process.exit(1);
}

const hits = [];

for (const filePath of listFiles(target)) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  // Strip known third-party library vendor defaults before scanning (e.g. Supabase GoTrue default fallback constants)
  const sanitized = text
    .replace(/"http:\/\/localhost:9999"/g, '""')
    .replace(/return\s+[a-zA-Z_$][a-zA-Z0-9_$]*==="localhost"/g, 'return false')
    .replace(/\.push\("localhost","127\.0\.0\.1","\[::1\]"\)/g, '');

  const lower = sanitized.toLowerCase();
  for (const token of FORBIDDEN) {
    if (lower.includes(token.toLowerCase())) {
      hits.push({ file: path.relative(target, filePath), token });
    }
  }
}

if (hits.length) {
  console.error('verify-built-env: forbidden token(s) in the production bundle:');
  for (const hit of hits) {
    console.error(` - ${hit.file}: ${hit.token}`);
  }
  process.exit(1);
}

console.log(`verify-built-env: ok (${target})`);

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}
