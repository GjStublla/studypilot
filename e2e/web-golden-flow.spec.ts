import { expect, test, type Page, type Route } from '@playwright/test';

const USER_ID = 'e2e-user';
const CHAT_ID = 'chat-rubric-e2e';
const RUBRIC_ID = 'rubric-e2e';
const ACTION_ID = 'action-e2e';
const ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMmUtdXNlciIsImV4cCI6NDEwMjQ0NDgwMH0.e2e-access-token';

type RubricRow = {
  id: string;
  user_id: string;
  title: string;
  course: string;
  uploaded_at: string;
  active: boolean;
  sessions_count: number;
  file_search_status: 'not_indexed' | 'pending' | 'indexing' | 'indexed' | 'failed';
  file_search_error: string | null;
  knowledge_document_id: string | null;
  criteria: Array<{ id: string; name: string; max_score: number; score: number }>;
};

type ChatRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  rubric_id: string | null;
  rubric_context_locked: boolean;
  context_summary: string | null;
  summary_through_sequence: number | null;
  title: string;
  origin_surface: 'dashboard' | 'extension' | 'legacy';
  client_key: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  user_id: string;
  chat_id: string;
  session_id: string | null;
  role: 'user' | 'ai';
  text: string;
  origin_surface: 'dashboard' | 'extension' | 'legacy';
  request_id: string | null;
  server_sequence: number;
  used_file_search: boolean;
  file_search_store_name: string | null;
  grounding_metadata: null;
  citations: Array<{ title: string; uri: string; snippet: string }> | null;
  created_at: string;
};

type ActionRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  rubric_id: string | null;
  text: string;
  done: boolean;
  created_at: string;
  updated_at: string;
};

type FixtureState = {
  rubrics: RubricRow[];
  chats: ChatRow[];
  messagesByChat: Map<string, MessageRow[]>;
  actionItems: ActionRow[];
  profile: {
    id: string;
    name: string;
    initials: string;
    email: string;
    theme: 'dark' | 'light';
    default_coach_mode: 'essay' | 'lecture' | 'reader';
  };
};

function createState(): FixtureState {
  return {
    rubrics: [],
    chats: [],
    messagesByChat: new Map(),
    actionItems: [],
    profile: {
      id: USER_ID,
      name: 'Alex Student',
      initials: 'AS',
      email: 'student@studypilot.test',
      theme: 'dark',
      default_coach_mode: 'essay',
    },
  };
}

function json(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function queryId(url: URL, field: string): string | null {
  const raw = url.searchParams.get(field);
  return raw?.startsWith('eq.') ? raw.slice(3) : null;
}

function makeChat(state: FixtureState): ChatRow {
  const now = new Date().toISOString();
  return {
    id: CHAT_ID,
    user_id: USER_ID,
    session_id: null,
    rubric_id: RUBRIC_ID,
    rubric_context_locked: true,
    context_summary: null,
    summary_through_sequence: null,
    title: 'Argumentative Essay Rubric',
    origin_surface: 'dashboard',
    client_key: null,
    created_at: now,
    updated_at: now,
  };
}

async function handleSupabase(route: Route, state: FixtureState) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/auth/v1/user') {
    return json(route, { id: USER_ID, email: state.profile.email, user_metadata: {} });
  }

  if (path === '/auth/v1/token') {
    return json(route, {
      access_token: ACCESS_TOKEN,
      refresh_token: 'e2e-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: USER_ID, email: state.profile.email },
    });
  }

  if (path === '/rest/v1/rpc/get_ai_usage') {
    return json(route, { used: 0, limit: 20 });
  }

  if (path === '/rest/v1/rpc/get_or_create_rubric_chat') {
    const chat = state.chats.find((row) => row.id === CHAT_ID) ?? makeChat(state);
    if (!state.chats.some((row) => row.id === chat.id)) state.chats.unshift(chat);
    return json(route, clone(chat));
  }

  if (path === '/rest/v1/rpc/set_active_rubric') {
    state.rubrics = state.rubrics.map((rubric) => ({ ...rubric, active: rubric.id === RUBRIC_ID }));
    return json(route, {});
  }

  if (path === '/rest/v1/rubrics') {
    if (request.method() === 'HEAD') {
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-0/${state.rubrics.length}`,
          'access-control-allow-origin': '*',
        },
        body: JSON.stringify([]),
      });
    }
    if (request.method() === 'GET') return json(route, clone(state.rubrics));
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '[]') as Array<Record<string, unknown>>;
      const input = body[0] ?? {};
      const now = new Date().toISOString();
      const row: RubricRow = {
        id: RUBRIC_ID,
        user_id: String(input.user_id ?? USER_ID),
        title: String(input.title ?? 'Argumentative Essay Rubric'),
        course: String(input.course ?? 'ENG 102'),
        uploaded_at: now,
        active: false,
        sessions_count: 0,
        file_search_status: 'not_indexed',
        file_search_error: null,
        knowledge_document_id: null,
        criteria: [],
      };
      state.rubrics = [row, ...state.rubrics.filter((item) => item.id !== row.id)];
      return json(route, clone(row));
    }
    if (request.method() === 'PATCH') {
      const id = queryId(url, 'id');
      const updates = JSON.parse(request.postData() ?? '{}') as Partial<RubricRow>;
      state.rubrics = state.rubrics.map((row) => row.id === id ? { ...row, ...updates } : row);
      return json(route, []);
    }
  }

  if (path.startsWith('/storage/v1/object/rubrics/')) {
    return json(route, { Key: path.slice('/storage/v1/object/'.length) });
  }

  if (path === '/functions/v1/extract-rubric') {
    const rubric = state.rubrics.find((row) => row.id === RUBRIC_ID);
    if (rubric) {
      rubric.criteria = [
        { id: `${RUBRIC_ID}-criterion-1`, name: 'Thesis', max_score: 4, score: 0 },
        { id: `${RUBRIC_ID}-criterion-2`, name: 'Evidence', max_score: 4, score: 0 },
      ];
    }
    return json(route, {
      extractedText: 'A strong argument states a clear thesis and supports it with relevant evidence.',
      criteria: [
        { name: 'Thesis', max_score: 4 },
        { name: 'Evidence', max_score: 4 },
      ],
      knowledgeDocumentId: 'knowledge-e2e',
      indexingStarted: true,
    });
  }

  if (path === '/functions/v1/ensure-file-search-store') {
    return json(route, { fileSearchStoreName: 'e2e-store', displayName: 'StudyPilot E2E' });
  }

  if (path === '/rest/v1/knowledge_documents') return json(route, []);

  if (path === '/rest/v1/action_items') {
    if (request.method() === 'GET') return json(route, clone(state.actionItems));
    return json(route, []);
  }

  if (path === '/rest/v1/sessions') return json(route, []);

  if (path === '/rest/v1/dashboard_chats') {
    if (request.method() === 'GET') return json(route, clone(state.chats));
    return json(route, []);
  }

  if (path === '/rest/v1/dashboard_chat_messages') {
    const chatId = queryId(url, 'chat_id');
    return json(route, clone(chatId ? state.messagesByChat.get(chatId) ?? [] : []));
  }

  if (path === '/functions/v1/socratic-coach') {
    const input = JSON.parse(request.postData() ?? '{}') as {
      chatId?: string;
      userMessage?: string;
      requestId?: string;
    };
    const chatId = input.chatId ?? CHAT_ID;
    const requestId = input.requestId ?? 'e2e-request';
    const now = new Date().toISOString();
    state.messagesByChat.set(chatId, [
      {
        id: 'message-user-e2e',
        user_id: USER_ID,
        chat_id: chatId,
        session_id: null,
        role: 'user',
        text: input.userMessage ?? '',
        origin_surface: 'dashboard',
        request_id: requestId,
        server_sequence: 1,
        used_file_search: false,
        file_search_store_name: null,
        grounding_metadata: null,
        citations: null,
        created_at: now,
      },
      {
        id: 'message-ai-e2e',
        user_id: USER_ID,
        chat_id: chatId,
        session_id: null,
        role: 'ai',
        text: 'Start with the rubric’s evidence criterion. Compare your claim with the source before revising.',
        origin_surface: 'dashboard',
        request_id: requestId,
        server_sequence: 2,
        used_file_search: true,
        file_search_store_name: 'e2e-store',
        grounding_metadata: null,
        citations: [{
          title: 'Argumentative Essay Rubric',
          uri: 'https://example.com/rubric',
          snippet: 'Evidence supports the thesis with relevant sources.',
        }],
        created_at: now,
      },
    ]);
    state.actionItems = [{
      id: ACTION_ID,
      user_id: USER_ID,
      session_id: null,
      rubric_id: RUBRIC_ID,
      text: 'Compare each claim with primary evidence before revising.',
      done: false,
      created_at: now,
      updated_at: now,
    }];
    const stream = [
      `data: ${JSON.stringify({ text: 'Start with the rubric’s evidence criterion. ' })}`,
      `data: ${JSON.stringify({ text: 'Compare your claim with the source before revising.' })}`,
      `data: ${JSON.stringify({
        type: 'commit',
        chatId,
        requestId,
        userMessageId: 'message-user-e2e',
        assistantMessageId: 'message-ai-e2e',
        userSequence: 1,
        assistantSequence: 2,
      })}`,
      'data: [DONE]',
      '',
    ].join('\n');
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: stream,
    });
  }

  return json(route, { error: `Unhandled Supabase fixture request: ${request.method()} ${path}` }, 404);
}

async function handleApi(route: Route, state: FixtureState) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === 'GET' && url.pathname === '/sessions') {
    return json(route, []);
  }
  if (request.method() === 'GET' && url.pathname === '/rubrics') {
    return json(route, state.rubrics.map((rubric) => ({
      ...rubric,
      criteria: rubric.criteria.map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        score: criterion.score,
        max_score: criterion.max_score,
      })),
    })));
  }
  if (request.method() === 'GET' && url.pathname === '/action-items') {
    return json(route, state.actionItems.map((item) => ({
      id: item.id,
      text: item.text,
      session_id: item.session_id,
      rubric_id: item.rubric_id,
      done: item.done,
    })));
  }
  if (url.pathname === '/users/me') {
    if (request.method() === 'PATCH') {
      Object.assign(state.profile, JSON.parse(request.postData() ?? '{}'));
    }
    return json(route, clone(state.profile));
  }
  return json(route, { error: `Unhandled API fixture request: ${request.method()} ${url.pathname}` }, 404);
}

async function installFixture(page: Page, state: FixtureState) {
  await page.addInitScript(({ accessToken, userId, email }) => {
    localStorage.setItem('sp_access_token', accessToken);
    localStorage.setItem('sp_refresh_token', 'e2e-refresh-token');
    localStorage.setItem('sp_user_id', userId);
    localStorage.setItem('sp_email', email);
  }, { accessToken: ACCESS_TOKEN, userId: USER_ID, email: state.profile.email });

  await page.route('https://api.example.com/**', (route) => handleApi(route, state));
  await page.route('https://supabase.example.com/**', (route) => handleSupabase(route, state));
}

test('rubric upload, grounded coaching, action item refresh, and reload persistence', async ({ page }) => {
  const state = createState();
  await installFixture(page, state);
  await page.goto('/#dashboard');

  await expect(page.getByRole('button', { name: 'Rubrics' })).toBeVisible();
  await page.getByRole('button', { name: 'Rubrics' }).click();
  await expect(page.locator('.ds-view-rubrics').getByRole('heading', { name: 'Rubrics' })).toBeVisible();

  await page.getByRole('button', { name: 'Upload rubric' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload rubric' });
  await expect(dialog).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'argument-rubric.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Thesis: 4 points. Evidence: 4 points.'),
  });
  await dialog.getByLabel('Rubric title').fill('Argumentative Essay Rubric');
  await dialog.getByLabel('Course').fill('ENG 102');
  await dialog.getByRole('button', { name: 'Upload & extract' }).click();

  await expect(page.getByRole('heading', { name: 'Argumentative Essay Rubric' })).toBeVisible();
  await expect(page.getByTestId('file-search-status')).toHaveText('Indexing…');
  await page.getByRole('button', { name: 'Ask about rubric' }).click();

  await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible();
  await expect(page.getByTestId('chat-rubric-chip')).toContainText('Argumentative Essay');
  const composer = page.getByPlaceholder(/Ask about your rubric/i);
  await composer.fill('How do I improve my evidence?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Compare your claim with the source before revising.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Action items' }).click();
  await expect(page.locator('.ds-view-todo').getByRole('heading', { name: 'Action items' })).toBeVisible();
  await expect(page.getByText('Compare each claim with primary evidence before revising.')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Action items' }).click();
  await expect(page.locator('.ds-view-todo').getByRole('heading', { name: 'Action items' })).toBeVisible();
  await page.getByRole('button', { name: 'Chat' }).click();
  await expect(page.getByText('Compare your claim with the source before revising.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('chat-rubric-chip')).toContainText('Argumentative Essay');
});
