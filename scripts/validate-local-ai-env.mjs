#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ENV_FILE = 'supabase/functions/.env.local';
const EXAMPLE_ENV_FILE = 'supabase/functions/.env.local.example';

export class LocalAiEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalAiEnvironmentError';
  }
}

function fail(message) {
  throw new LocalAiEnvironmentError(message);
}

function decodeDoubleQuotedValue(value) {
  return value.replace(/\\(n|r|t|"|\\)/g, (_match, character) => {
    if (character === 'n') return '\n';
    if (character === 'r') return '\r';
    if (character === 't') return '\t';
    return character;
  });
}

export function parseLocalEnv(text) {
  const values = {};
  for (const [index, originalLine] of text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    let line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trimStart();

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) fail(`line ${index + 1} is not a valid KEY=value entry`);
    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (value.startsWith("'") || value.startsWith('"')) {
      const quote = value[0];
      if (value.length < 2 || value.at(-1) !== quote) {
        fail(`line ${index + 1} has an unterminated quoted value for ${key}`);
      }
      value = value.slice(1, -1);
      if (quote === '"') value = decodeDoubleQuotedValue(value);
    } else {
      value = value.replace(/\s+#.*$/, '').trimEnd();
    }
    values[key] = value;
  }
  return values;
}

function parseCredentialsJson(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('GEMINI_SERVICE_ACCOUNT_CREDENTIALS must be a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof LocalAiEnvironmentError) throw error;
    fail('GEMINI_SERVICE_ACCOUNT_CREDENTIALS must be valid JSON copied from a Google Cloud service-account key.');
  }
}

function validatePrivateKey(value, variableName) {
  if (!value.includes('-----BEGIN PRIVATE KEY-----') || !value.includes('-----END PRIVATE KEY-----')) {
    fail(`${variableName} must contain a complete PEM private key.`);
  }
}

export function validateLocalAiEnvText(text) {
  const env = parseLocalEnv(text);
  const explicitProjectId =
    env.GOOGLE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT_ID || env.GEMINI_PROJECT_ID || '';
  const hasSplitEmail = Boolean(env.GOOGLE_CLIENT_EMAIL);
  const hasSplitKey = Boolean(env.GOOGLE_PRIVATE_KEY);
  const hasSplitCredentials = hasSplitEmail && hasSplitKey;
  const credentialsJsonValue = env.GEMINI_SERVICE_ACCOUNT_CREDENTIALS;
  let credentialsJson;

  if (credentialsJsonValue && (!hasSplitCredentials || !explicitProjectId)) {
    credentialsJson = parseCredentialsJson(credentialsJsonValue);
  }

  let authMode;
  if (hasSplitCredentials) {
    validatePrivateKey(env.GOOGLE_PRIVATE_KEY, 'GOOGLE_PRIVATE_KEY');
    authMode = 'split-service-account';
  } else if (credentialsJsonValue) {
    credentialsJson ??= parseCredentialsJson(credentialsJsonValue);
    if (typeof credentialsJson.client_email !== 'string' || !credentialsJson.client_email.trim()) {
      fail('GEMINI_SERVICE_ACCOUNT_CREDENTIALS is missing client_email.');
    }
    if (typeof credentialsJson.private_key !== 'string' || !credentialsJson.private_key.trim()) {
      fail('GEMINI_SERVICE_ACCOUNT_CREDENTIALS is missing private_key.');
    }
    validatePrivateKey(credentialsJson.private_key, 'GEMINI_SERVICE_ACCOUNT_CREDENTIALS.private_key');
    authMode = 'service-account-json';
  } else if (env.GEMINI_API_KEY) {
    fail(
      "GEMINI_API_KEY is not used by StudyPilot's Vertex-only Edge Functions. Set GEMINI_SERVICE_ACCOUNT_CREDENTIALS or both GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  } else {
    fail('Set GEMINI_SERVICE_ACCOUNT_CREDENTIALS or both GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }

  const projectId = explicitProjectId || credentialsJson?.project_id || '';
  if (!projectId) {
    fail('Set GOOGLE_PROJECT_ID or include project_id in GEMINI_SERVICE_ACCOUNT_CREDENTIALS.');
  }

  const warnings = [];
  if (env.AI_USAGE_LIMITS_DISABLED?.trim().toLowerCase() !== 'true') {
    warnings.push('AI_USAGE_LIMITS_DISABLED is not true; local requests will use normal limits.');
  }

  return { authMode, projectId, warnings };
}

export function formatLocalAiEnvResult(result) {
  return `validate-local-ai-env: Vertex configuration is ready (${result.authMode}; project ID present)`;
}

async function validateFile(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      fail(`missing ${file}; copy ${EXAMPLE_ENV_FILE} to ${DEFAULT_ENV_FILE} and add your own Vertex credentials`);
    }
    throw error;
  }
  return validateLocalAiEnvText(text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length > 3) fail('pass at most one environment-file path');
    const result = await validateFile(process.argv[2] || DEFAULT_ENV_FILE);
    console.log(formatLocalAiEnvResult(result));
    for (const warning of result.warnings) console.warn(`validate-local-ai-env: warning: ${warning}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`validate-local-ai-env: ${message}`);
    process.exitCode = 1;
  }
}
