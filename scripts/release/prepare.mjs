import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolveRepository } from './repository.mjs';
import { nextVersion } from './version.mjs';
import { releases } from './github.mjs';

const repository = resolveRepository(true);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const tags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' }).trim().split(/\r?\n/);
const existing = await releases(repository);
const version = nextVersion(manifest.version, [
  ...tags,
  ...existing.map((release) => release.tag_name),
]);
manifest.version = lock.version = lock.packages[''].version = version;
manifest.repository = {
  type: 'git',
  url: `https://github.com/${repository.owner}/${repository.repo}.git`,
};
await writeFile('package.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Release version: ${version}`);
