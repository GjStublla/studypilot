#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Cross-surface claim guard.
 *
 * This deliberately checks wording, not product behavior. Runtime behavior
 * still needs the unit, browser, database, and hosted gates described in the
 * judging plan. The optional extension root lets a local two-repository
 * checkout verify the canonical extension README without making a web-only
 * clone fail.
 */

export const CLAIM_RULES = Object.freeze([
  {
    id: 'chosen-page-context',
    description: 'microphone disclosure is paired with chosen page context',
    patterns: [/microphone[\s\S]{0,180}page context/i],
  },
  {
    id: 'grounding-disclosure',
    description: 'grounding availability is disclosed',
    patterns: [/grounding/i],
  },
  {
    id: 'citation-qualification',
    description: 'citation/cite language is present for grounded answers',
    patterns: [/\bcit(?:e|ation)s?\b/i],
  },
  {
    id: 'screenshot-consent',
    description: 'screenshot sharing is opt-in',
    patterns: [
      /screenshots?[\s\S]{0,120}(?:only when|off unless)[\s\S]{0,80}(?:enable|turn them on)/i,
      /screenshots?[\s\S]{0,120}unless you enable them/i,
    ],
  },
  {
    id: 'dashboard-persistence-consent',
    description: 'dashboard history/storage is opt-in',
    patterns: [
      /(?:chat and session history|chat\/session history)[\s\S]{0,100}save only when[\s\S]{0,100}save to dashboard/i,
      /dashboard history stay off unless[\s\S]{0,80}(?:enable|turn them on)/i,
      /dashboard save stay off unless[\s\S]{0,80}(?:enable|turn them on)/i,
      /saving chats and sessions to the dashboard[\s\S]{0,100}(?:off unless|turn it on|enable)/i,
    ],
  },
]);

export const FORBIDDEN_CLAIMS = Object.freeze([
  { id: 'tab-audio', pattern: /\btab audio\b/i },
  { id: 'exact-second-citations', pattern: /exact second/i },
  { id: 'local-only-audio', pattern: /stay on your device/i },
  { id: 'no-account', pattern: /\bno account\b/i },
  { id: 'never-leaves-device', pattern: /never leaves your device/i },
]);

export const WEB_DOCUMENTS = Object.freeze([
  { label: 'web README', relativePath: 'README.md' },
  { label: 'web landing copy', relativePath: 'src/App.tsx' },
  { label: 'web legal copy', relativePath: 'src/components/LegalPage.tsx' },
  { label: 'final report draft', relativePath: 'docs/submission/final-report-content.md' },
]);

export const DEMO_DOCUMENT = Object.freeze({
  label: 'demo script',
  relativePath: 'docs/submission/demo-script.md',
  // The script is human-owned communication copy. Its required capability and
  // privacy disclosures are reviewed manually, while retired claims are still
  // blocked automatically by the shared forbidden-claim rules.
  claimRules: Object.freeze([]),
});

function matchesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

export function validateClaimDocuments(documents, {
  claimRules = CLAIM_RULES,
  forbiddenClaims = FORBIDDEN_CLAIMS,
} = {}) {
  const failures = [];
  for (const document of documents) {
    const text = String(document.text ?? '');
    for (const rule of document.claimRules ?? claimRules) {
      if (!matchesAny(text, rule.patterns)) {
        failures.push({
          document: document.label,
          rule: rule.id,
          message: `missing ${rule.description}`,
        });
      }
    }
    for (const rule of forbiddenClaims) {
      if (rule.pattern.test(text)) {
        failures.push({
          document: document.label,
          rule: rule.id,
          message: 'contains an unsupported or retired claim',
        });
      }
    }
  }
  return {
    ok: failures.length === 0,
    checkedDocuments: documents.map(document => document.label),
    failures,
  };
}

export function parseCliArgs(argv, cwd = process.cwd()) {
  let extensionRoot = path.resolve(cwd, '..', 'studypilot-extension');
  let requireExtension = false;
  let includeDemoScript = false;
  let requireDemoScript = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-extension') {
      requireExtension = true;
    } else if (argument === '--include-demo-script') {
      includeDemoScript = true;
    } else if (argument === '--require-demo-script') {
      includeDemoScript = true;
      requireDemoScript = true;
    } else if (argument === '--extension-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--extension-root requires a path');
      }
      extensionRoot = path.resolve(cwd, value);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      return {
        help: true,
        extensionRoot,
        requireExtension,
        includeDemoScript,
        requireDemoScript,
      };
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return {
    help: false,
    extensionRoot,
    requireExtension,
    includeDemoScript,
    requireDemoScript,
  };
}

export function loadClaimDocuments(root, {
  extensionRoot = path.resolve(root, '..', 'studypilot-extension'),
  requireExtension = false,
  includeDemoScript = false,
  requireDemoScript = false,
} = {}) {
  const documents = WEB_DOCUMENTS.map(document => ({
    ...document,
    path: path.join(root, document.relativePath),
    text: fs.readFileSync(path.join(root, document.relativePath), 'utf8'),
  }));
  const extensionReadme = path.join(extensionRoot, 'README.md');
  if (fs.existsSync(extensionReadme)) {
    documents.push({
      label: 'canonical extension README',
      relativePath: path.relative(root, extensionReadme),
      path: extensionReadme,
      text: fs.readFileSync(extensionReadme, 'utf8'),
    });
  } else if (requireExtension) {
    throw new Error(`canonical extension README not found: ${extensionReadme}`);
  }

  if (includeDemoScript || requireDemoScript) {
    const demoScriptPath = path.join(root, DEMO_DOCUMENT.relativePath);
    if (fs.existsSync(demoScriptPath)) {
      documents.push({
        ...DEMO_DOCUMENT,
        path: demoScriptPath,
        text: fs.readFileSync(demoScriptPath, 'utf8'),
      });
    } else if (requireDemoScript) {
      throw new Error(`demo script not found: ${demoScriptPath}`);
    }
  }

  return documents;
}

function printHelp() {
  console.log('Usage: node scripts/validate-claims.mjs [--extension-root PATH] [--require-extension] [--include-demo-script] [--require-demo-script]');
  console.log('Checks public claim wording in the web repository and, when present, the canonical extension README.');
  console.log('The optional demo-script check blocks retired claims while leaving its required wording for human review.');
}

export function run(argv = process.argv.slice(2), root = process.cwd()) {
  const options = parseCliArgs(argv, root);
  if (options.help) {
    printHelp();
    return 0;
  }
  const documents = loadClaimDocuments(root, options);
  const result = validateClaimDocuments(documents);
  for (const label of result.checkedDocuments) {
    console.log(`validate:claims: checked ${label}`);
  }
  if (!documents.some(document => document.label === 'canonical extension README')) {
    console.log('validate:claims: canonical extension README SKIPPED (not present; use --require-extension locally)');
  }
  if (options.includeDemoScript && !documents.some(document => document.label === 'demo script')) {
    console.log('validate:claims: demo script SKIPPED (not present; use --require-demo-script to fail)');
  }
  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`validate:claims: ${failure.document}: ${failure.rule}: ${failure.message}`);
    }
    return 1;
  }
  console.log(`validate:claims: passed (${documents.length} documents)`);
  return 0;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`validate:claims: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
