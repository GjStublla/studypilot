// Streaming chat client for the Socratic coaching Edge Function.
//
// Handles SSE (Server-Sent Events) streaming from the socratic-coach
// Supabase Edge Function. Supports both Google OAuth users (Supabase session)
// and email/password users (FastAPI JWT in localStorage).

import { supabase } from './supabaseClient';

export interface SocraticCoachCallbacks {
  onTokenReceived: (token: string) => void;
  onStreamComplete: () => void;
  onStreamError: (error: unknown) => void;
}

/**
 * Get the best available auth token for calling Edge Functions.
 * Prefers the Supabase OAuth session token, falls back to the
 * FastAPI-managed token in localStorage (email/password users).
 * Both are valid Supabase JWTs — the Edge Function accepts either.
 */
async function getAuthToken(): Promise<string> {
  // Check for an active OAuth session first (no network call)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    // Decode exp to check if token is still valid
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const isExpired = payload.exp < Date.now() / 1000;
      console.log(`[socraticCoach] OAuth session token — exp: ${new Date(payload.exp * 1000).toISOString()}, expired: ${isExpired}`);
      if (isExpired) {
        console.log('[socraticCoach] Session token expired, falling back to localStorage');
      } else {
        return session.access_token;
      }
    } catch {
      return session.access_token;
    }
  }

  // Email/password users: the token in localStorage is a valid Supabase JWT
  const raw = localStorage.getItem('sp_access_token');
  if (raw) {
    try {
      const payload = JSON.parse(atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const isExpired = payload.exp < Date.now() / 1000;
      console.log(`[socraticCoach] localStorage token — exp: ${new Date(payload.exp * 1000).toISOString()}, expired: ${isExpired}`);
    } catch {
      console.log('[socraticCoach] Using localStorage token (could not decode)');
    }
    return raw;
  }

  throw new Error('Not authenticated. Please sign in again.');
}

/**
 * Send a message to the Socratic coach and stream the response.
 * Calls onTokenReceived for each streamed token, then onStreamComplete.
 * Calls onStreamError if anything goes wrong.
 */
export async function sendCoachingMessage(
  sessionId: string | undefined,
  userMessageText: string,
  callbacks: SocraticCoachCallbacks,
): Promise<void> {
  const { onTokenReceived, onStreamComplete, onStreamError } = callbacks;

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
          sessionId,
          userMessage: userMessageText,
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
          onStreamComplete();
          return;
        }

        try {
          const parsed = JSON.parse(content) as { text?: string; error?: string };
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
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

    // Stream ended without a [DONE] signal — still complete successfully
    onStreamComplete();
  } catch (error) {
    onStreamError(error);
  }
}

/**
 * Convenience wrapper that accumulates the full response string.
 * Useful for non-streaming contexts that still want the complete text.
 */
export async function streamCoachingResponse(
  sessionId: string | undefined,
  userMessageText: string,
  onToken: (token: string) => void,
): Promise<string> {
  let fullResponse = '';

  await new Promise<void>((resolve, reject) => {
    sendCoachingMessage(sessionId, userMessageText, {
      onTokenReceived: (token) => {
        fullResponse += token;
        onToken(token);
      },
      onStreamComplete: resolve,
      onStreamError: reject,
    });
  });

  return fullResponse;
}
