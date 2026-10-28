import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { HomebaseRequests } = createRequire(import.meta.url)('../../electron/homebase-requests.cjs');
test('launcher handoff is bounded, accepts Unicode local saves, and reports unreadable files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'homebase-handoff-'));
  try {
    const file = path.join(root, '基地 test.sav');
    await writeFile(file, Buffer.from('GVASfixture'));
    const q = new HomebaseRequests();
    q.enqueue(['--open-homebase', 'https://example.com/test.sav']);
    q.enqueue(['--open-homebase', 'relative.sav']);
    q.enqueue(['--open-homebase', file + '.exe']);
    assert.equal(await q.take(), null);
    q.enqueue(['app', '--open-homebase', file]);
    const item = await q.take();
    assert.equal(item.name, '基地 test.sav');
    assert.equal(Buffer.from(item.bytes).toString(), 'GVASfixture');
    q.enqueue(['--open-homebase', path.join(root, 'missing.sav')]);
    assert.ok((await q.take()).error);
    for (let i = 0; i < 20; i++) q.enqueue(['--open-homebase', file]);
    assert.equal(q.queue.length, 8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
