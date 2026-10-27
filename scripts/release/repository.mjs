import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function parseRepository(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9](?:[A-Za-z0-9-]*))\/([A-Za-z0-9_.-]+)$/.exec(
      normalized,
    );
  if (!match || ['.', '..'].includes(match[2]))
    throw new Error('Use a GitHub repository in owner/name format.');
  return { owner: match[1], repo: match[2] };
}

export function resolveRepository(required = false) {
  const configured = process.env.HOMEBASE_REPOSITORY || process.env.GITHUB_REPOSITORY;
  if (configured) return parseRepository(configured);
  try {
    return parseRepository(
      execFileSync('git', ['remote', 'get-url', 'origin'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    const url =
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    if (url) return parseRepository(url);
    if (required)
      throw new Error('Set HOMEBASE_REPOSITORY=owner/name, or build in GitHub Actions.');
    return null;
  }
}
