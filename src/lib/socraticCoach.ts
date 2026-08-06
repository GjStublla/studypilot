// Streaming chat client for the Socratic coaching Edge Function.
//
// Handles SSE (Server-Sent Events) streaming from the socratic-coach
// Supabase Edge Function. Supports both Google OAuth users (Supabase session)
// and email/password users (FastAPI JWT in localStorage).

import { supabase } from './supabaseClient';
import type { OriginSurface, SocraticCoachCommit } from './studypilot-types';

export interface SocraticCoachOptions {
  requestId: string;
  originSurface: OriginSurface;
}

export interface SocraticCoachCallbacks {
  onTokenReceived: (token: string) => void;
}

/**
 * Get the best available auth token for calling Edge Functions.
 * Prefers the Supabase OAuth session token, falls back to the
 * FastAPI-managed token in localStorage (email/password users).
 * Both are valid Supabase JWTs — the Edge Function accepts either.
 */
async function getAuthToken(): Promise<string> {
  // Check for an active OAuth session first (no network call needed).
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp > Date.now() / 1000) return session.access_token;
    } catch {
      return session.access_token;
    }
  }

  // Email/password users: token is in localStorage.
  const raw = localStorage.getItem('sp_access_token');
  if (raw) return raw;

  throw new Error('Not authenticated. Please sign in again.');
}

/**
 * Send a message to the Socratic coach and stream the response.
 * Calls onTokenReceived for each streamed token.
 * Resolves with { commit } when the stream ends with a [DONE] signal.
 * Rejects if the stream closes without [DONE] or the server sends an error.
 */
export async function sendCoachingMessage(
  chatId: string,
  userMessageText: string,
  options: SocraticCoachOptions,
  callbacks: SocraticCoachCallbacks,
): Promise<{ commit?: SocraticCoachCommit }> {
  const { requestId, originSurface } = options;
  const { onTokenReceived } = callbacks;

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
        requestId,
        originSurface,
      }),
    },
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      (errData as { error?: string }).error ?? `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body stream available.');

  const decoder = new TextDecoder();
  let buffer = '';
  let commit: SocraticCoachCommit | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const clean = line.trim();
      if (!clean.startsWith('data: ')) continue;

      const content = clean.slice(6).trim();
      if (content === '[DONE]') {
        return { commit };
      }

      try {
        const parsed = JSON.parse(content) as {
          type?: string;
          text?: string;
          error?: string;
          chatId?: string;
          requestId?: string;
          userMessageId?: string;
          assistantMessageId?: string;
          userSequence?: number;
          assistantSequence?: number;
        };
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.type === 'commit') {
          commit = parsed as unknown as SocraticCoachCommit;
        } else if (parsed.text) {
          onTokenReceived(parsed.text);
        }
      } catch (parseErr) {
        // Only re-throw if it's our own error, not a partial JSON chunk
        if (parseErr instanceof Error && parseErr.message !== content) {
          throw parseErr;
        }
      }
    }
  }

  // Stream closed without a [DONE] signal — treat as an error
  throw new Error('Stream ended before completion');
}

/**
 * Convenience wrapper that accumulates the full response string.
 * Useful for non-streaming contexts that still want the complete text.
 */
export async function streamCoachingResponse(
  chatId: string,
  userMessageText: string,
  onToken: (token: string) => void,
): Promise<string> {
  let fullResponse = '';

  const requestId = crypto.randomUUID();
  await sendCoachingMessage(
    chatId,
    userMessageText,
    { requestId, originSurface: 'dashboard' },
    {
      onTokenReceived: (token) => {
        fullResponse += token;
        onToken(token);
      },
    },
  );

  return fullResponse;
}
