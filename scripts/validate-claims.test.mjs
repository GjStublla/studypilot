import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  CLAIM_RULES,
  FORBIDDEN_CLAIMS,
  parseCliArgs,
  validateClaimDocuments,
} from './validate-claims.mjs';

const VALID_COPY = [
  'Uses your microphone and the page context you choose to share.',
  'Answers can cite retrieved rubric evidence when grounding is available.',
  'Screenshots are sent only when you enable them.',
  'Chat and session history save only when Save to dashboard is on.',
].join(' ');

test('accepts the aligned claim set', () => {
  const result = validateClaimDocuments([
    { label: 'fixture', text: VALID_COPY },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('rejects missing privacy consent language', () => {
  const result = validateClaimDocuments([
    { label: 'fixture', text: 'Uses your microphone and page context. Answers can cite evidence when grounding is available.' },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map(failure => failure.rule),
    ['screenshot-consent', 'dashboard-persistence-consent'],
  );
});

test('rejects retired capability claims', () => {
  const result = validateClaimDocuments([
    { label: 'fixture', text: `${VALID_COPY} We capture tab audio and cite the exact second.` },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map(failure => failure.rule),
    ['tab-audio', 'exact-second-citations'],
  );
});

test('supports a reduced rule set for targeted checks', () => {
  const result = validateClaimDocuments(
    [{ label: 'fixture', text: 'grounding is available' }],
    { claimRules: [CLAIM_RULES[1]], forbiddenClaims: FORBIDDEN_CLAIMS },
  );
  assert.equal(result.ok, true);
});

test('parses the optional sibling-repository requirement', () => {
  const options = parseCliArgs(
    ['--extension-root', '../canonical-extension', '--require-extension'],
    'C:/workspace/studypilot',
  );
  assert.equal(options.requireExtension, true);
  assert.equal(
    options.extensionRoot,
    path.resolve('C:/workspace/studypilot', '../canonical-extension'),
  );
});
