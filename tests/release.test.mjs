import { it, expect } from 'vitest';
import { nextVersion } from '../scripts/release/version.mjs';
import { parseRepository } from '../scripts/release/repository.mjs';
import { installerConfig } from '../scripts/build/installer-config.mjs';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

it('increments beyond every existing release, including older v tags and drafts', () => {
  expect(nextVersion('1.7.0', [])).toBe('1.7.1');
  expect(nextVersion('1.7.0', ['1.7.9', 'v1.7.10', '1.8.0-rc.1', 'latest'])).toBe('1.7.11');
  expect(nextVersion('2.0.0', ['1.99.99'])).toBe('2.0.1');
  expect(nextVersion('1.7.0', ['2.0.0'])).toBe('2.0.1');
  expect(() => nextVersion('1.7.65535', [])).toThrow();
  expect(() => nextVersion('bad', [])).toThrow();
});

it('accepts only a GitHub repository identity without credentials or query strings', () => {
  for (const input of [
    'owner/viewer',
    'https://github.com/owner/viewer.git',
    'git@github.com:owner/viewer.git',
  ])
    expect(parseRepository(input)).toEqual({ owner: 'owner', repo: 'viewer' });
  for (const input of [
    '',
    'https://evil.test/owner/viewer',
    'https://token@github.com/owner/viewer',
    'owner/repo?token=secret',
    'owner/..',
  ])
    expect(() => parseRepository(input)).toThrow();
});

it('keeps install identity stable and preserves app data across upgrades', () => {
  const a = installerConfig({ owner: 'one', repo: 'viewer' }, '1.7.1');
  const b = installerConfig({ owner: 'two', repo: 'viewer' }, '1.7.2');
  expect(a.appId).toBe(b.appId);
  expect(a.nsis.guid).toBe(b.nsis.guid);
  expect(a.nsis.deleteAppDataOnUninstall).toBe(false);
  expect(a.nsis.perMachine).toBe(false);
  expect(a.publish[0]).toMatchObject({ provider: 'github', vPrefixedTagName: false });
  expect(installerConfig(null, '1.7.0').publish).toBeNull();
});

it('serializes default-branch releases and tests before publishing', () => {
  const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8'));
  expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  expect(workflow.jobs.release.if).toContain('default_branch');
  const steps = workflow.jobs.release.steps.map((s) => s.run).filter(Boolean);
  expect(steps.indexOf('npm run check')).toBeLessThan(
    steps.indexOf('node scripts/release/prepare.mjs'),
  );
  expect(steps.indexOf('npm run test:smoke')).toBeLessThan(
    steps.indexOf('node scripts/release/publish.mjs'),
  );
  expect(workflow.permissions.contents).toBe('read');
});
