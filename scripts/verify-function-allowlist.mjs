#!/usr/bin/env node
/**
 * Verifies the hosted project exposes exactly the repository Edge Functions
 * with verify_jwt enabled. Treat any other slug (including ai-generate) as drift.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=rqszloxxegvxaedptcqj npm run verify:functions
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'rqszloxxegvxaedptcqj'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

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
}

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is required')
  process.exit(1)
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`,
  {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  },
)

if (!response.ok) {
  console.error(`Failed to list functions: ${response.status} ${await response.text()}`)
  process.exit(1)
}

const functions = await response.json()
const bySlug = new Map(functions.map((fn) => [fn.slug, fn]))

const errors = []

for (const [slug, verifyJwt] of Object.entries(EXPECTED)) {
  const fn = bySlug.get(slug)
  if (!fn) {
    errors.push(`missing function: ${slug}`)
    continue
  }
  if (fn.verify_jwt !== verifyJwt) {
    errors.push(`${slug}: verify_jwt=${fn.verify_jwt}, expected ${verifyJwt}`)
  }
  if (fn.status && fn.status !== 'ACTIVE') {
    errors.push(`${slug}: status=${fn.status}, expected ACTIVE`)
  }
}

for (const slug of bySlug.keys()) {
  if (!(slug in EXPECTED)) {
    errors.push(`unexpected function present: ${slug}`)
  }
}

if (errors.length) {
  console.error('Function allowlist check failed:')
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

const count = Object.keys(EXPECTED).length
console.log(`Function allowlist OK: exactly ${count} JWT-verified functions.`)
