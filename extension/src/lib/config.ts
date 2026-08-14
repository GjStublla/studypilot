declare const __STUDYPILOT_SUPABASE_URL__: string;
declare const __STUDYPILOT_SUPABASE_ANON_KEY__: string;

export type ExtensionConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

const STORAGE_KEYS = {
  config: 'studypilot.config',
  auth: 'studypilot.auth',
  selection: 'studypilot.selection',
  resumption: 'studypilot.liveResumption',
  pendingTurns: 'studypilot.pendingTurns',
} as const;

export { STORAGE_KEYS };

export async function loadConfig(): Promise<ExtensionConfig> {
  const fromDefine = {
    supabaseUrl: typeof __STUDYPILOT_SUPABASE_URL__ === 'string' ? __STUDYPILOT_SUPABASE_URL__ : '',
    supabaseAnonKey:
      typeof __STUDYPILOT_SUPABASE_ANON_KEY__ === 'string' ? __STUDYPILOT_SUPABASE_ANON_KEY__ : '',
  };

  const stored = await chrome.storage.local.get(STORAGE_KEYS.config);
  const overlay = (stored[STORAGE_KEYS.config] ?? {}) as Partial<ExtensionConfig>;

  let fileConfig: Partial<ExtensionConfig> = {};
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    if (res.ok) {
      const json = (await res.json()) as {
        supabaseUrl?: string | null;
        supabaseAnonKey?: string | null;
      };
      fileConfig = {
        supabaseUrl: json.supabaseUrl ?? undefined,
        supabaseAnonKey: json.supabaseAnonKey ?? undefined,
      };
    }
  } catch {
    // unpacked without config.json is fine
  }

  return {
    supabaseUrl: overlay.supabaseUrl || fileConfig.supabaseUrl || fromDefine.supabaseUrl || '',
    supabaseAnonKey:
      overlay.supabaseAnonKey || fileConfig.supabaseAnonKey || fromDefine.supabaseAnonKey || '',
  };
}

export async function saveConfig(partial: Partial<ExtensionConfig>): Promise<void> {
  const current = await loadConfig();
  await chrome.storage.local.set({
    [STORAGE_KEYS.config]: { ...current, ...partial },
  });
}

export type StoredAuth = {
  accessToken: string;
  refreshToken?: string;
};

export async function loadAuth(): Promise<StoredAuth | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.auth);
  const auth = stored[STORAGE_KEYS.auth] as StoredAuth | undefined;
  if (!auth?.accessToken) return null;
  return auth;
}

export async function saveAuth(auth: StoredAuth | null): Promise<void> {
  if (!auth) {
    await chrome.storage.local.remove(STORAGE_KEYS.auth);
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.auth]: auth });
}
