import type { Session } from '@supabase/supabase-js';
import { clearAuth, storeAuth } from './api';
import {
  LOCAL_DEV_EMAIL,
  LOCAL_DEV_MODE,
  LOCAL_DEV_PASSWORD,
} from './localDev';
import { supabase } from './supabaseClient';

let bootstrapInFlight: Promise<Session> | null = null;

function storeLocalSession(session: Session): Session {
  const email = session.user.email ?? LOCAL_DEV_EMAIL;

  storeAuth({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user_id: session.user.id,
    email,
  });

  return session;
}

async function createLocalSession(): Promise<Session> {
  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  if (existingSession?.user.email === LOCAL_DEV_EMAIL) {
    const { data: verified, error } = await supabase.auth.getUser(
      existingSession.access_token,
    );
    if (!error && verified.user?.email === LOCAL_DEV_EMAIL) {
      return storeLocalSession(existingSession);
    }

    await supabase.auth.signOut({ scope: 'local' }).catch(() => {
      // A database reset can invalidate the old session server-side. The next
      // password sign-in still replaces the client state.
    });
  }

  clearAuth();

  const signIn = await supabase.auth.signInWithPassword({
    email: LOCAL_DEV_EMAIL,
    password: LOCAL_DEV_PASSWORD,
  });

  if (signIn.data.session) {
    return storeLocalSession(signIn.data.session);
  }

  if (signIn.error && signIn.error.status !== 400) {
    throw new Error(signIn.error.message);
  }

  const signUp = await supabase.auth.signUp({
    email: LOCAL_DEV_EMAIL,
    password: LOCAL_DEV_PASSWORD,
    options: {
      data: {
        name: 'Local Developer',
        initials: 'LD',
      },
    },
  });

  if (signUp.data.session) {
    return storeLocalSession(signUp.data.session);
  }

  if (
    signUp.error &&
    typeof signUp.error.status === 'number' &&
    signUp.error.status >= 500
  ) {
    throw new Error(signUp.error.message);
  }

  // A dashboard and extension can attempt first-run signup together. If the
  // other client won that race, the user now exists and a second sign-in works.
  const retry = await supabase.auth.signInWithPassword({
    email: LOCAL_DEV_EMAIL,
    password: LOCAL_DEV_PASSWORD,
  });

  if (retry.data.session) {
    return storeLocalSession(retry.data.session);
  }

  const message =
    retry.error?.message ??
    signUp.error?.message ??
    signIn.error?.message ??
    'Local Supabase did not return a session.';
  throw new Error(message);
}

export function ensureLocalDevAuth(): Promise<Session> {
  if (!LOCAL_DEV_MODE) {
    return Promise.reject(new Error('Local development authentication is not enabled.'));
  }

  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = createLocalSession().finally(() => {
    bootstrapInFlight = null;
  });

  return bootstrapInFlight;
}
