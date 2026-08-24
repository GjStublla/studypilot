#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_COLUMNS = [
  'participant_id',
  'completed',
  'time_to_feedback_seconds',
  'before_score',
  'after_score',
  'citations_checked',
  'citations_supported',
  'error_free',
  'median_latency_ms',
  'sus_score',
  'quote_approved',
];

const BOOLEAN_COLUMNS = new Set(['completed', 'error_free', 'quote_approved']);
const INTEGER_COLUMNS = new Set(['citations_checked', 'citations_supported']);
const RUBRIC_SCORE_COLUMNS = new Set(['before_score', 'after_score']);
const NON_NEGATIVE_COLUMNS = new Set([
  'time_to_feedback_seconds',
  'citations_checked',
  'citations_supported',
  'median_latency_ms',
]);

const SENSITIVE_VALUE_PATTERNS = [
  { label: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: 'Supabase access token', pattern: /\bsbp_[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: 'private key', pattern: /-----BEGIN [^-]*PRIVATE KEY-----/i },
  {
    label: 'draft or credential content',
    pattern: /\b(?:essay|transcript|rubric|audio|screenshot|auth(?:entication)?|service[_ -]?role|private[_ -]?key)\b/i,
  },
];

export class PilotValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PilotValidationError';
  }
}

/**
 * Parse the small RFC 4180 subset used by the fixed pilot CSV.
 * Quoted commas, escaped quotes, CRLF, and blank trailing lines are supported.
 */
export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushRow = () => {
    if (row.length === 0 && field === '') return;
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
    row = [];
    field = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw new PilotValidationError(`unexpected quote at character ${index + 1}`);
      }
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      pushRow();
    } else if (character === '\r') {
      if (source[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new PilotValidationError('unterminated quoted field');
  pushRow();
  return rows;
}

function fail(message) {
  throw new PilotValidationError(message);
}

function parseBoolean(value, rowNumber, column) {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    fail(`row ${rowNumber}, ${column} must be true or false`);
  }
  return normalized === 'true';
}

function parseNumber(value, rowNumber, column) {
  const normalized = value.trim();
  if (normalized === '') fail(`row ${rowNumber}, ${column} is required`);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) fail(`row ${rowNumber}, ${column} must be a finite number`);
  return parsed;
}

function parseCell(value, rowNumber, column) {
  const normalized = value.trim();
  for (const { label, pattern } of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(normalized)) {
      fail(`row ${rowNumber}, ${column} contains ${label}; remove it from the research file`);
    }
  }

  if (column === 'participant_id') return normalized;
  if (BOOLEAN_COLUMNS.has(column)) return parseBoolean(normalized, rowNumber, column);

  const parsed = parseNumber(normalized, rowNumber, column);
  if (INTEGER_COLUMNS.has(column) && (!Number.isInteger(parsed) || parsed < 0)) {
    fail(`row ${rowNumber}, ${column} must be a non-negative integer`);
  }
  if (NON_NEGATIVE_COLUMNS.has(column) && parsed < 0) {
    fail(`row ${rowNumber}, ${column} must be non-negative`);
  }
  if (RUBRIC_SCORE_COLUMNS.has(column) && (parsed < 0 || parsed > 100)) {
    fail(`row ${rowNumber}, ${column} must be between 0 and 100`);
  }
  if (column === 'sus_score' && (parsed < 0 || parsed > 100)) {
    fail(`row ${rowNumber}, sus_score must be between 0 and 100`);
  }
  return parsed;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value) {
  return Number(value.toFixed(3));
}

export function validatePilotCsv(text, { requireData = false } = {}) {
  const rows = parseCsv(text);
  if (rows.length === 0) fail('CSV is empty; include the fixed header row');

  const header = rows[0].map(value => value.trim());
  if (header.length !== REQUIRED_COLUMNS.length || header.some((value, index) => value !== REQUIRED_COLUMNS[index])) {
    fail(`header must be exactly: ${REQUIRED_COLUMNS.join(',')}`);
  }

  const dataRows = rows.slice(1);
  if (requireData && dataRows.length === 0) {
    fail('no participant rows are present; collect approved pilot data before requiring results');
  }
  if (dataRows.length === 0) {
    return { status: 'empty', participantCount: 0, metrics: null };
  }

  const participantIds = new Set();
  const records = dataRows.map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== REQUIRED_COLUMNS.length) {
      fail(`row ${rowNumber} must contain exactly ${REQUIRED_COLUMNS.length} columns`);
    }

    const record = Object.fromEntries(
      REQUIRED_COLUMNS.map((column, columnIndex) => [column, parseCell(values[columnIndex], rowNumber, column)]),
    );
    const participantId = values[0].trim();
    if (!/^P\d{3}$/.test(participantId)) {
      fail(`row ${rowNumber}, participant_id must use the anonymous P### format (for example, P001)`);
    }
    if (participantIds.has(participantId)) fail(`row ${rowNumber}, participant_id is duplicated`);
    participantIds.add(participantId);
    record.participant_id = participantId;
    if (record.citations_supported > record.citations_checked) {
      fail(`row ${rowNumber}, citations_supported cannot exceed citations_checked`);
    }
    return record;
  });

  const citationsChecked = records.reduce((sum, record) => sum + record.citations_checked, 0);
  const citationsSupported = records.reduce((sum, record) => sum + record.citations_supported, 0);
  const beforeScores = records.map(record => record.before_score);
  const afterScores = records.map(record => record.after_score);
  const metrics = {
    participantCount: records.length,
    completedCount: records.filter(record => record.completed).length,
    completionRate: roundMetric(records.filter(record => record.completed).length / records.length),
    medianTimeToFeedbackSeconds: roundMetric(median(records.map(record => record.time_to_feedback_seconds))),
    meanBeforeScore: roundMetric(mean(beforeScores)),
    meanAfterScore: roundMetric(mean(afterScores)),
    meanScoreChange: roundMetric(mean(afterScores.map((score, index) => score - beforeScores[index]))),
    citationsChecked,
    citationsSupported,
    groundingPrecision: citationsChecked === 0 ? null : roundMetric(citationsSupported / citationsChecked),
    errorFreeCount: records.filter(record => record.error_free).length,
    errorFreeRate: roundMetric(records.filter(record => record.error_free).length / records.length),
    medianResponseLatencyMs: roundMetric(median(records.map(record => record.median_latency_ms))),
    meanSus: roundMetric(mean(records.map(record => record.sus_score))),
    approvedQuoteCount: records.filter(record => record.quote_approved).length,
  };

  return { status: 'validated', participantCount: records.length, metrics };
}

export function formatPilotResult(result) {
  if (result.status === 'empty') {
    return 'validate-pilot-results: no participant rows; template validated, no pilot result claimed';
  }

  const { metrics } = result;
  const grounding = metrics.groundingPrecision === null
    ? 'unavailable (no citations checked)'
    : `${metrics.groundingPrecision} (${metrics.citationsSupported}/${metrics.citationsChecked})`;
  return [
    `validate-pilot-results: ${metrics.participantCount} participant row(s) validated`,
    `completion_rate: ${metrics.completionRate} (${metrics.completedCount}/${metrics.participantCount})`,
    `median_time_to_feedback_seconds: ${metrics.medianTimeToFeedbackSeconds}`,
    `mean_before_score: ${metrics.meanBeforeScore}`,
    `mean_after_score: ${metrics.meanAfterScore}`,
    `mean_score_change: ${metrics.meanScoreChange}`,
    `grounding_precision: ${grounding}`,
    `error_free_rate: ${metrics.errorFreeRate} (${metrics.errorFreeCount}/${metrics.participantCount})`,
    `median_response_latency_ms: ${metrics.medianResponseLatencyMs}`,
    `mean_sus: ${metrics.meanSus}`,
    `approved_quote_rows: ${metrics.approvedQuoteCount}`,
    'note: these are pilot observations, not causal evidence of learning improvement',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { file: 'docs/validation/pilot-results.csv', requireData: false, json: false };
  for (const argument of argv) {
    if (argument === '--require-data') options.requireData = true;
    else if (argument === '--json') options.json = true;
    else if (argument.startsWith('-')) fail(`unknown option ${argument}`);
    else if (options.file !== 'docs/validation/pilot-results.csv') fail('only one CSV path may be provided');
    else options.file = argument;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const text = await fs.readFile(options.file, 'utf8');
    const result = validatePilotCsv(text, { requireData: options.requireData });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatPilotResult(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`validate-pilot-results: ${message}`);
    process.exitCode = 1;
  }
}
