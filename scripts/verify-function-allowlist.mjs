#!/usr/bin/env node
/**
 * Verifies the hosted project exposes exactly the repository Edge Functions
 * with verify_jwt enabled. Treat any other slug (including ai-generate) as drift.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=rqszloxxegvxaedptcqj npm run verify:functions
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'rqszloxxegvxaedptcqj';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const EXPECTED = {
  'live-token': true,
  'live-rubric-search': true,
  'live-turn': true,
  'live-finish': true,
  'ensure-file-search-store': true,
  'extract-rubric': true,
  'index-knowledge-document': true,
  'socratic-coach': true,
  'summarize-session': true,
  'delete-knowledge-document': true,
};

if (!TOKEN) {
  console.error('verify:functions: authentication missing');
  console.error('Reason: SUPABASE_ACCESS_TOKEN environment variable is not set.');
  console.error('Provide a valid Supabase Management API access token (sbp_...) to run hosted verification.');
  process.exit(1);
}

let response;
try {
  response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
} catch (err) {
  console.error('verify:functions: network failure');
  console.error(`Reason: Could not reach Supabase Management API (${err?.message || err}).`);
  process.exit(1);
}

if (!response.ok) {
  if (response.status === 401 || response.status === 403) {
    console.error(`verify:functions: API authentication failed (HTTP ${response.status})`);
    console.error('Reason: SUPABASE_ACCESS_TOKEN was rejected by the Supabase API.');
  } else {
    console.error(`verify:functions: API request failed with HTTP ${response.status}`);
  }
  process.exit(1);
}

let functions;
try {
  functions = await response.json();
} catch {
  console.error('verify:functions: malformed API response');
  process.exit(1);
}

if (!Array.isArray(functions)) {
  console.error('verify:functions: malformed API response');
  process.exit(1);
}

const bySlug = new Map(functions.map((fn) => [fn.slug, fn]));
const errors = [];

for (const [slug, verifyJwt] of Object.entries(EXPECTED)) {
  const fn = bySlug.get(slug);
  if (!fn) {
    errors.push(`expected function missing: ${slug}`);
    continue;
  }
  if (fn.verify_jwt !== verifyJwt) {
    errors.push(`${slug}: verify_jwt=${fn.verify_jwt}, expected ${verifyJwt}`);
  }
  if (fn.status && fn.status !== 'ACTIVE') {
    errors.push(`${slug}: status=${fn.status}, expected ACTIVE`);
  }
}

for (const slug of bySlug.keys()) {
  if (!(slug in EXPECTED)) {
    errors.push(`unexpected deployed function: ${slug}`);
  }
}

if (errors.length) {
  console.error('verify:functions: function allowlist check failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

const count = Object.keys(EXPECTED).length;
console.log(`verify:functions: ok (exactly ${count} JWT-verified functions deployed in ${PROJECT_REF})`);
