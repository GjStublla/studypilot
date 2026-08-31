import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { formatLocalAiEnvResult, validateLocalAiEnvText } from './validate-local-ai-env.mjs';

test('rejects a local environment without Vertex credentials', () => {
  assert.throws(
    () => validateLocalAiEnvText('AI_USAGE_LIMITS_DISABLED=true\n'),
    /Set GEMINI_SERVICE_ACCOUNT_CREDENTIALS or both GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY/,
  );
});

test('explains that a Gemini API key cannot replace Vertex credentials', () => {
  assert.throws(
    () =>
      validateLocalAiEnvText(
        'AI_USAGE_LIMITS_DISABLED=true\nGEMINI_API_KEY=local-key\nGOOGLE_PROJECT_ID=study-pilot-dev\n',
      ),
    /GEMINI_API_KEY is not used by StudyPilot's Vertex-only Edge Functions/,
  );
});

test('rejects malformed service-account JSON with an actionable variable name', () => {
  assert.throws(
    () => validateLocalAiEnvText("AI_USAGE_LIMITS_DISABLED=true\nGEMINI_SERVICE_ACCOUNT_CREDENTIALS='{not-json}'\n"),
    /GEMINI_SERVICE_ACCOUNT_CREDENTIALS must be valid JSON/,
  );
});

test('accepts a complete JSON service account without exposing secret material', () => {
  const credentials = JSON.stringify({
    project_id: 'study-pilot-dev',
    client_email: 'local-ai@study-pilot-dev.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nsecret-test-material\\n-----END PRIVATE KEY-----\\n',
  });
  const result = validateLocalAiEnvText(
    `AI_USAGE_LIMITS_DISABLED=true\nGEMINI_SERVICE_ACCOUNT_CREDENTIALS='${credentials}'\n`,
  );

  assert.deepEqual(result, {
    authMode: 'service-account-json',
    projectId: 'study-pilot-dev',
    warnings: [],
  });
  const formatted = formatLocalAiEnvResult(result);
  assert.match(formatted, /Vertex configuration is ready/);
  assert.doesNotMatch(formatted, /secret-test-material|local-ai@/);
});

test('accepts split Vertex credentials with an explicit project id', () => {
  const result = validateLocalAiEnvText(
    [
      'AI_USAGE_LIMITS_DISABLED=true',
      'GOOGLE_PROJECT_ID=study-pilot-dev',
      'GOOGLE_CLIENT_EMAIL=local-ai@study-pilot-dev.iam.gserviceaccount.com',
      'GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nsecret-test-material\\n-----END PRIVATE KEY-----\\n"',
      '',
    ].join('\n'),
  );

  assert.equal(result.authMode, 'split-service-account');
  assert.equal(result.projectId, 'study-pilot-dev');
});

test('warns when the local-only AI usage bypass is not enabled', () => {
  const credentials = JSON.stringify({
    project_id: 'study-pilot-dev',
    client_email: 'local-ai@study-pilot-dev.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nsecret-test-material\\n-----END PRIVATE KEY-----\\n',
  });
  const result = validateLocalAiEnvText(`GEMINI_SERVICE_ACCOUNT_CREDENTIALS='${credentials}'\n`);

  assert.deepEqual(result.warnings, ['AI_USAGE_LIMITS_DISABLED is not true; local requests will use normal limits.']);
});

test('runs the AI preflight before serving local Edge Functions', () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(packageJson.scripts['local:check'], 'node scripts/validate-local-ai-env.mjs');
  assert.match(packageJson.scripts['local:functions'], /^npm run local:check && /);
});
