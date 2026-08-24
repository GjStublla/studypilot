#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve('src/components');
const supabaseApi = resolve('src/lib/studypilot-api.ts');
const domainTypes = /\b(?:ActionItem|FileSearchStatus|Rubric|Session|TranscriptLine)\b/;
const dashboardExports =
  /export\s+(?:async\s+)?function\s+(?:fetchSessions|fetchRubrics|fetchActionItems|fetchSessionTranscript|setActionItemDone)\b/g;

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(?:ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of walk(root)) {
  const source = readFileSync(file, 'utf8');
  const importsDashboardApi = source.includes('dashboardApi');
  const importsDomainType =
    /\btype\s+[^;\n]*from\s+['"][^'"]*dashboardApi['"]/.test(source) ||
    /\btype\s+[^;]*from\s+['"][^'"]*dashboardApi['"]/.test(source);
  if (importsDashboardApi && importsDomainType && domainTypes.test(source)) {
    violations.push(relative(process.cwd(), file));
  }
}

const supabaseSource = readFileSync(supabaseApi, 'utf8');
if (dashboardExports.test(supabaseSource)) {
  violations.push(relative(process.cwd(), supabaseApi));
}

if (violations.length > 0) {
  console.error('verify-dashboard-boundary: dashboard data must stay behind src/lib/dashboardApi.ts:');
  for (const file of violations) console.error(`  - ${file}`);
  process.exit(1);
}

console.log('verify-dashboard-boundary: ok (components use the canonical dashboard type boundary)');
