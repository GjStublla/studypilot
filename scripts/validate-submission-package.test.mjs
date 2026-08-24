import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  EXPECTED_DEMO_RANGES,
  REQUIRED_REPORT_SECTIONS,
  findPendingFinalInputs,
  parseCliArgs,
  validateDemoTimeline,
  validateReportSections,
  validateSubmissionArtifacts,
} from './validate-submission-package.mjs';

const ROOT = process.cwd();
const report = fs.readFileSync(path.join(ROOT, 'docs/submission/final-report-content.md'), 'utf8');
const demo = fs.readFileSync(path.join(ROOT, 'docs/submission/demo-script.md'), 'utf8');
const checklist = fs.readFileSync(path.join(ROOT, 'docs/submission/submission-checklist.md'), 'utf8');

test('accepts the checked-in report section order', () => {
  const result = validateReportSections(report);
  assert.equal(result.ok, true);
  assert.deepEqual(result.headings, REQUIRED_REPORT_SECTIONS);
});

test('accepts the checked-in demo timeline and fallback requirements', () => {
  const result = validateDemoTimeline(demo);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ranges, EXPECTED_DEMO_RANGES);
});

test('rejects report sections in the wrong order', () => {
  const result = validateReportSections('## 1. Project Overview\n## 3. Solution Overview');
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /exactly 9/);
});

test('rejects an overlong or incomplete demo timeline', () => {
  const result = validateDemoTimeline('Target length: 2:00 maximum\n| 0:00-2:00 | only one step |');
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(failure => /1:58 maximum/.test(failure)));
  assert.ok(result.failures.some(failure => /text-input fallback/.test(failure)));
});

test('reports human-owned final inputs without treating them as structural failures', () => {
  const pending = findPendingFinalInputs({
    report: '## 1. Project Overview\n- [Member name]',
    checklist: '- [ ] Demo video: [link]',
  });
  assert.equal(pending.length, 2);
  const result = validateSubmissionArtifacts({ report, demo, checklist });
  assert.equal(result.ok, true);
  assert.ok(result.pendingInputs.length > 0);
});

test('parses the strict final-input mode', () => {
  assert.deepEqual(parseCliArgs(['--require-final-inputs']), {
    help: false,
    requireFinalInputs: true,
  });
});
