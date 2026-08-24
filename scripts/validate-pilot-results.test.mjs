import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_COLUMNS,
  formatPilotResult,
  validatePilotCsv,
} from './validate-pilot-results.mjs';

const HEADER = REQUIRED_COLUMNS.join(',');

function csv(rows = []) {
  return `${HEADER}\n${rows.join('\n')}\n`;
}

test('accepts the checked-in empty template without claiming pilot evidence', () => {
  const result = validatePilotCsv(csv());

  assert.deepEqual(result, { status: 'empty', participantCount: 0, metrics: null });
  assert.match(formatPilotResult(result), /template validated, no pilot result claimed/);
});

test('calculates protocol metrics with explicit denominators', () => {
  const result = validatePilotCsv(
    csv([
      'P001,true,12,40,55,4,3,true,800,70,false',
      'P002,false,18,50,50,0,0,true,1000,80,true',
    ]),
  );

  assert.equal(result.status, 'validated');
  assert.equal(result.participantCount, 2);
  assert.deepEqual(result.metrics, {
    participantCount: 2,
    completedCount: 1,
    completionRate: 0.5,
    medianTimeToFeedbackSeconds: 15,
    meanBeforeScore: 45,
    meanAfterScore: 52.5,
    meanScoreChange: 7.5,
    citationsChecked: 4,
    citationsSupported: 3,
    groundingPrecision: 0.75,
    errorFreeCount: 2,
    errorFreeRate: 1,
    medianResponseLatencyMs: 900,
    meanSus: 75,
    approvedQuoteCount: 1,
  });
  assert.match(formatPilotResult(result), /grounding_precision: 0.75 \(3\/4\)/);
  assert.match(formatPilotResult(result), /not causal evidence/);
});

test('requires participant data only when explicitly requested', () => {
  assert.throws(() => validatePilotCsv(csv(), { requireData: true }), /no participant rows/);
});

test('rejects malformed rows and impossible citation counts', () => {
  assert.throws(
    () => validatePilotCsv(csv(['Alice,true,12,40,55,1,1,true,800,70,false'])),
    /anonymous P### format/,
  );
  assert.throws(
    () => validatePilotCsv(csv(['P001,true,12,40,55,1,2,true,800,70,false'])),
    /citations_supported cannot exceed citations_checked/,
  );
  assert.throws(
    () => validatePilotCsv(csv(['P001,yes,12,40,55,1,1,true,800,70,false'])),
    /completed must be true or false/,
  );
  assert.throws(
    () => validatePilotCsv(csv(['P001,true,12,40,55,1,1,true,800,101,false'])),
    /sus_score must be between 0 and 100/,
  );
});

test('rejects identifying, credential, and draft-content values', () => {
  assert.throws(
    () => validatePilotCsv(csv(['student@example.com,true,12,40,55,1,1,true,800,70,false'])),
    /email address/,
  );
  assert.throws(
    () => validatePilotCsv(csv([`P001,true,12,40,55,1,1,true,${'sb' + 'p_'}abcdefghijklmnopqrstuvwxyz,70,false`])),
    /Supabase access token/,
  );
  assert.throws(
    () => validatePilotCsv(csv(['P001,true,rubric,40,55,1,1,true,800,70,false'])),
    /draft or credential content/,
  );
});

test('requires the fixed header in the documented order', () => {
  assert.throws(
    () => validatePilotCsv('participant_id,completed\n'),
    /header must be exactly/,
  );
});
