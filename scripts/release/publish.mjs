import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveRepository } from './repository.mjs';
import { github, releases } from './github.mjs';
import { verifyInstaller } from './verify-installer.mjs';
import { releaseDirectory } from '../build/output.mjs';

if (process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('Publishing runs only in GitHub Actions.');
const repository = resolveRepository(true);
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const report = await verifyInstaller(version, repository);
const base = `/repos/${repository.owner}/${repository.repo}`;
const existing = (await releases(repository)).find((release) => release.tag_name === version);
if (existing)
  throw new Error(`Release ${version} already exists. Start a new workflow run for a new version.`);
const release = await (
  await github(`${base}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: version,
      target_commitish: process.env.GITHUB_SHA,
      name: `Homebase Viewer ${version}`,
      draft: true,
      prerelease: false,
      generate_release_notes: true,
    }),
  })
).json();
for (const asset of report.assets) {
  const bytes = await readFile(`${releaseDirectory(version)}/${asset.name}`);
  const url = new URL(`https://uploads.github.com${base}/releases/${release.id}/assets`);
  url.searchParams.set('name', asset.name);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: bytes,
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status}): ${asset.name}`);
  const uploaded = await response.json();
  if (uploaded.size !== asset.size) throw new Error(`Uploaded size mismatch: ${asset.name}`);
  let digest = uploaded.digest;
  if (!digest) {
    const download = await github(`${base}/releases/assets/${uploaded.id}`, {
      headers: { Accept: 'application/octet-stream' },
    });
    const hash = createHash('sha256');
    for await (const chunk of download.body) hash.update(chunk);
    digest = `sha256:${hash.digest('hex')}`;
  }
  if (digest !== `sha256:${asset.sha256}`)
    throw new Error(`Uploaded checksum mismatch: ${asset.name}`);
}
await github(`${base}/releases/${release.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ draft: false, make_latest: 'true' }),
});
console.log(
  `Published https://github.com/${repository.owner}/${repository.repo}/releases/tag/${version}`,
);
