import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const actionUses = [...workflow.matchAll(/^\s*uses:\s+(\S+)(?:\s+#.*)?$/gm)];
const pinnedReferences = [...workflow.matchAll(/^\s*uses:\s+([^@\s]+)@([0-9a-f]{40})\s+#\s+(\S+)\s*$/gm)];

test('every GitHub Action uses an immutable commit pin', () => {
  assert.ok(actionUses.length > 0, 'expected GitHub Action references in CI');
  assert.equal(
    pinnedReferences.length,
    actionUses.length,
    'every GitHub Action must use a 40-character commit pin with a version comment',
  );
});

test('repeated GitHub Action versions use one pinned commit across CI jobs', () => {
  const pinsByActionVersion = new Map();
  for (const [, action, commit, version] of pinnedReferences) {
    const key = `${action}@${version}`;
    const pins = pinsByActionVersion.get(key) ?? new Set();
    pins.add(commit);
    pinsByActionVersion.set(key, pins);
  }

  for (const [actionVersion, pins] of pinsByActionVersion) {
    assert.equal(pins.size, 1, `${actionVersion} uses inconsistent commit pins: ${[...pins].join(', ')}`);
  }
});
