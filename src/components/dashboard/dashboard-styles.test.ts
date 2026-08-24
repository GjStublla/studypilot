import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('dashboard stylesheet boundaries', () => {
  it('keeps shell, chat, content, and precedence styles in their dedicated files', () => {
    const shell = read('./DashboardShell.css');
    const chat = read('./ChatView.css');
    const content = read('./ContentViews.css');
    const shared = read('../Dashboard.css');

    expect(shell).toContain('/* ---------- Sidebar ---------- */');
    expect(shell).toContain('.app-dashboard .ds-sidebar');
    expect(chat).toContain('/* ---------- Chat ---------- */');
    expect(chat).toContain('.app-dashboard .ds-context-strip');
    expect(content).toContain('/* ---------- Home hero ---------- */');
    expect(content).toContain('/* ---------- Upload Rubric Modal ---------- */');
    expect(content).toContain('.app-dashboard .ds-rubric-list');
    expect(shared).toContain('/* ---------- Responsive ---------- */');
    expect(shared).toContain('/* Light theme overrides */');
    expect(shared).not.toContain('/* ---------- Chat ---------- */');
    expect(shared).not.toContain('/* ---------- Home hero ---------- */');
  });

  it('imports the shared precedence layer after moved base styles', () => {
    const dashboard = read('../Dashboard.tsx');
    const shellImport = dashboard.indexOf("import './dashboard/DashboardShell.css';");
    const chatImport = dashboard.indexOf("import './dashboard/ChatView.css';");
    const contentImport = dashboard.indexOf("import './dashboard/ContentViews.css';");
    const sharedImport = dashboard.indexOf("import './Dashboard.css';");

    expect(shellImport).toBeGreaterThanOrEqual(0);
    expect(shellImport).toBeLessThan(chatImport);
    expect(chatImport).toBeLessThan(contentImport);
    expect(contentImport).toBeLessThan(sharedImport);
  });
});
