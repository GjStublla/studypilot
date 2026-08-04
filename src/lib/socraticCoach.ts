// Streaming chat client for the Socratic coaching Edge Function.

import { supabase } from './supabaseClient';
import type {
  OriginSurface,
  SocraticCoachCommit,
  SocraticCoachStreamError,
} from './studypilot-types';

export interface SocraticCoachOptions {
  requestId: string;
  originSurface: OriginSurface;
  clientContext?: Record<string, unknown>;
}

export interface SocraticCoachCallbacks {
  onTokenReceived: (token: string) => void;
  onCommitReceived?: (commit: SocraticCoachCommit) => void;
  onStreamComplete?: (commit: SocraticCoachCommit | null) => void;
  onStreamError?: (error: unknown) => void;
}

export interface SocraticCoachResult {
  commit: SocraticCoachCommit | null;
}

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp >= Date.now() / 1000) return session.access_token;
    } catch {
      return session.access_token;
    }
  }

  const raw = localStorage.getItem('sp_access_token');
  if (raw) return raw;

  throw new Error('Not authenticated. Please sign in again.');
}

function isCommit(value: unknown): value is SocraticCoachCommit {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<SocraticCoachCommit>;
  return event.type === 'commit'
    && typeof event.chatId === 'string'
    && typeof event.requestId === 'string'
    && typeof event.userMessageId === 'string'
    && typeof event.assistantMessageId === 'string'
    && typeof event.userSequence === 'number'
    && typeof event.assistantSequence === 'number';
}

function streamError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as SocraticCoachStreamError;
  return typeof event.error === 'string' ? event.error : null;
}

/**
 * Send one idempotent coaching request. The promise resolves only after the
 * server's DONE event; a commit payload means both canonical rows were durable.
 * Legacy `{ text }` token events remain accepted during a rolling deployment.
 */
export async function sendCoachingMessage(
  chatId: string,
  userMessageText: string,
  options: SocraticCoachOptions,
  callbacks: SocraticCoachCallbacks,
): Promise<SocraticCoachResult> {
  try {
    const authToken = await getAuthToken();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/socratic-coach`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          chatId,
          userMessage: userMessageText,
          requestId: options.requestId,
          originSurface: options.originSurface,
          ...(options.clientContext ? { clientContext: options.clientContext } : {}),
        }),
      },
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        (errData as { error?: string }).error
          ?? `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body stream available.');

    const decoder = new TextDecoder();
    let buffer = '';
    let commit: SocraticCoachCommit | null = null;
    let doneSeen = false;

    const consumeBlock = (block: string) => {
      const content = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();
      if (!content) return;
      if (content === '[DONE]') {
        doneSeen = true;
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error('The AI stream returned malformed data.');
      }

      const errorMessage = streamError(parsed);
      if (errorMessage) throw new Error(errorMessage);

      if (isCommit(parsed)) {
        if (parsed.chatId !== chatId || parsed.requestId !== options.requestId) {
          throw new Error('The AI stream commit did not match this request.');
        }
        commit = parsed;
        callbacks.onCommitReceived?.(parsed);
        return;
      }

      const token = parsed && typeof parsed === 'object'
        ? (parsed as { text?: unknown }).text
        : undefined;
      if (typeof token === 'string' && token) callbacks.onTokenReceived(token);
    };

    while (!doneSeen) {
      const { done, value } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        consumeBlock(block);
        if (doneSeen) break;
        boundary = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    if (!doneSeen) throw new Error('The AI stream ended before completion.');
    callbacks.onStreamComplete?.(commit);
    return { commit };
  } catch (error) {
    callbacks.onStreamError?.(error);
    throw error;
  }
}

export async function streamCoachingResponse(
  chatId: string,
  userMessageText: string,
  onToken: (token: string) => void,
): Promise<string> {
  let fullResponse = '';
  await sendCoachingMessage(
    chatId,
    userMessageText,
    {
      requestId: crypto.randomUUID(),
      originSurface: 'dashboard',
    },
    {
      onTokenReceived: (token) => {
        fullResponse += token;
        onToken(token);
      },
    },
  );
  return fullResponse;
}
