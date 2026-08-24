import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  CLAIM_RULES,
  DEMO_DOCUMENT,
  FORBIDDEN_CLAIMS,
  loadClaimDocuments,
  parseCliArgs,
  PITCH_DOCUMENT,
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

test('parses the required demo-script check', () => {
  const options = parseCliArgs(
    ['--include-demo-script', '--require-demo-script'],
    'C:/workspace/studypilot',
  );
  assert.equal(options.includeDemoScript, true);
  assert.equal(options.requireDemoScript, true);
});

test('parses the required pitch-brief check', () => {
  const options = parseCliArgs(['--require-pitch-brief'], 'C:/workspace/studypilot');
  assert.equal(options.includePitchBrief, true);
  assert.equal(options.requirePitchBrief, true);
});

test('checks retired claims in human-owned demo copy without requiring every disclosure', () => {
  const result = validateClaimDocuments([
    { label: DEMO_DOCUMENT.label, text: 'The demo captures tab audio.', claimRules: [] },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map(failure => failure.rule), ['tab-audio']);
});

test('checks retired claims in the human-owned pitch brief without requiring final-pitch approval', () => {
  const result = validateClaimDocuments([
    { label: PITCH_DOCUMENT.label, text: 'The pitch captures tab audio.', claimRules: [] },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map(failure => failure.rule), ['tab-audio']);
});

test('loads the checked-in demo script when requested', () => {
  const documents = loadClaimDocuments(process.cwd(), {
    requireDemoScript: true,
    extensionRoot: path.resolve(process.cwd(), '..', 'studypilot-extension'),
  });
  assert.equal(documents.at(-1)?.label, DEMO_DOCUMENT.label);
});

test('loads the checked-in pitch brief when requested', () => {
  const documents = loadClaimDocuments(process.cwd(), {
    requirePitchBrief: true,
  });
  assert.equal(documents.at(-1)?.label, PITCH_DOCUMENT.label);
});
