#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const REQUIRED_REPORT_SECTIONS = Object.freeze([
  '1. Project Overview',
  '2. Problem Statement',
  '3. Solution Overview',
  '4. Development Process',
  '5. Technical Stack',
  '6. Architectural Design Diagram',
  '7. Features Implemented',
  '8. Challenges Faced & Solutions',
  '9. Team Contributions',
]);

export const EXPECTED_DEMO_RANGES = Object.freeze([
  ['0:00', '0:12'],
  ['0:12', '0:28'],
  ['0:28', '0:48'],
  ['0:48', '1:13'],
  ['1:13', '1:31'],
  ['1:31', '1:47'],
  ['1:47', '1:58'],
]);

export const CHECKLIST_ARTIFACT_MARKERS = Object.freeze([
  'Deployed web URL',
  'Chrome Web Store/beta-access state',
  'Demo video',
  'Backup video/screenshots',
  'Pilot summary',
]);

function seconds(timestamp) {
  const match = /^(\d+):(\d{2})$/.exec(timestamp);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateReportSections(text) {
  const headings = [...String(text).matchAll(/^##\s+(.+?)\s*$/gm)]
    .map(match => match[1].trim());
  const failures = [];

  if (headings.length !== REQUIRED_REPORT_SECTIONS.length) {
    failures.push(
      `expected exactly ${REQUIRED_REPORT_SECTIONS.length} top-level report sections, found ${headings.length}`,
    );
  }

  REQUIRED_REPORT_SECTIONS.forEach((expected, index) => {
    if (headings[index] !== expected) {
      failures.push(`section ${index + 1} must be "${expected}"`);
    }
  });

  return { ok: failures.length === 0, failures, headings };
}

export function validateDemoTimeline(text) {
  const source = String(text);
  const ranges = [...source.matchAll(/(\d+:\d{2})\s*[–-]\s*(\d+:\d{2})/g)]
    .map(match => [match[1], match[2]]);
  const failures = [];

  if (!/Target length:\s*(?:\*{2})?\s*1:58\s*maximum/i.test(source)) {
    failures.push('demo script must declare a 1:58 maximum target length');
  }
  if (!/text-input fallback/i.test(source)) {
    failures.push('demo script must include a text-input fallback');
  }
  if (!/backup recording/i.test(source)) {
    failures.push('demo script must include a backup recording instruction');
  }
  if (ranges.length !== EXPECTED_DEMO_RANGES.length) {
    failures.push(`expected ${EXPECTED_DEMO_RANGES.length} time-coded demo segments, found ${ranges.length}`);
  }

  EXPECTED_DEMO_RANGES.forEach(([start, end], index) => {
    const actual = ranges[index];
    if (!actual || actual[0] !== start || actual[1] !== end) {
      failures.push(`demo segment ${index + 1} must run ${start}–${end}`);
    }
  });

  const finalEnd = ranges.at(-1)?.[1];
  if (finalEnd && (seconds(finalEnd) ?? Number.POSITIVE_INFINITY) > 118) {
    failures.push('demo timeline exceeds the 1:58 submission limit');
  }

  return { ok: failures.length === 0, failures, ranges };
}

export function validateChecklistMarkers(text) {
  const source = String(text);
  const failures = CHECKLIST_ARTIFACT_MARKERS
    .filter(marker => !source.includes(marker))
    .map(marker => `checklist is missing the "${marker}" marker`);
  return { ok: failures.length === 0, failures };
}

export function findPendingFinalInputs({ report, checklist }) {
  const pending = [];
  const reportSource = String(report);
  const checklistLines = String(checklist).split(/\r?\n/);

  if (/\[(?:Member name|approved role|link|n, target)/i.test(reportSource)) {
    pending.push('final report still contains participant/contribution/link placeholders');
  }

  for (const line of checklistLines) {
    if (/^\s*-\s*\[ \]/.test(line) && /(Historical|Chrome|Demo|Backup|Pilot|Team members|Mentor|Deployed)/i.test(line)) {
      pending.push(line.trim());
    }
  }

  return pending;
}

export function validateSubmissionArtifacts({ report, demo, checklist }) {
  const reportResult = validateReportSections(report);
  const demoResult = validateDemoTimeline(demo);
  const checklistResult = validateChecklistMarkers(checklist);
  const failures = [
    ...reportResult.failures,
    ...demoResult.failures,
    ...checklistResult.failures,
  ];

  return {
    ok: failures.length === 0,
    failures,
    pendingInputs: findPendingFinalInputs({ report, checklist }),
    report: reportResult,
    demo: demoResult,
    checklist: checklistResult,
  };
}

export function parseCliArgs(argv) {
  let requireFinalInputs = false;
  for (const argument of argv) {
    if (argument === '--require-final-inputs') {
      requireFinalInputs = true;
    } else if (argument === '--help' || argument === '-h') {
      return { help: true, requireFinalInputs };
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { help: false, requireFinalInputs };
}

function readArtifact(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function printHelp() {
  console.log('Usage: node scripts/validate-submission-package.mjs [--require-final-inputs]');
  console.log('Checks report section order, demo timing/fallback structure, and checklist markers.');
  console.log('--require-final-inputs also fails while human-owned links, pilot, contribution, or approval inputs remain.');
}

export function run(argv = process.argv.slice(2), root = process.cwd()) {
  const options = parseCliArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const result = validateSubmissionArtifacts({
    report: readArtifact(root, 'docs/submission/final-report-content.md'),
    demo: readArtifact(root, 'docs/submission/demo-script.md'),
    checklist: readArtifact(root, 'docs/submission/submission-checklist.md'),
  });

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`validate:submission: ${failure}`);
    }
    return 1;
  }

  console.log('validate:submission: report sections, demo timeline, and checklist markers passed');
  if (result.pendingInputs.length > 0) {
    if (options.requireFinalInputs) {
      for (const pending of result.pendingInputs) {
        console.error(`validate:submission: pending final input: ${pending}`);
      }
      return 1;
    }
    console.log(`validate:submission: ${result.pendingInputs.length} human-owned final input(s) remain pending`);
  } else {
    console.log('validate:submission: no human-owned final inputs remain pending');
  }
  return 0;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`validate:submission: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
