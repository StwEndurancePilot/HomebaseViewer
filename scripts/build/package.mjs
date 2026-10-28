import { prepareNotices } from './notices.mjs';
import { packager } from '@electron/packager';
import { mkdir, copyFile, writeFile, readdir, readFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractFile } from '@electron/asar';
async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(target)));
    else result.push(target);
  }
  return result;
}
await prepareNotices();
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const paths = await packager({
  dir: '.',
  name: 'Homebase Viewer',
  platform: 'win32',
  arch: 'x64',
  out: process.env.HOMEBASE_PORTABLE_OUTPUT || path.join('artifacts', manifest.version),
  overwrite: true,
  asar: true,
  prune: true,
  ignore: (file) => {
    const root = file.replaceAll('\\', '/').split('/').filter(Boolean)[0];
    return (
      !!root &&
      ![
        'dist',
        'electron',
        'notices',
        'docs',
        'package.json',
        'README.md',
        'THIRD-PARTY.md',
        'LICENSE',
      ].includes(root)
    );
  },
  appVersion: manifest.version,
  executableName: 'Homebase Viewer',
});
for (const output of paths) {
  await copyFile('electron/homebase-open.json', path.join(output, 'resources/homebase-open.json'));
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'Start-Homebase-Viewer.cmd'),
    '@echo off\r\ncd /d "%~dp0"\r\nstart "" "%~dp0Homebase Viewer.exe"\r\n',
  );
  await copyFile('README.md', path.join(output, 'README.md'));
  await copyFile('THIRD-PARTY.md', path.join(output, 'THIRD-PARTY.md'));
  await cp('docs', path.join(output, 'docs'), { recursive: true });
  await cp('notices', path.join(output, 'notices'), { recursive: true });
  await copyFile('LICENSE', path.join(output, 'LICENSE'));
  const checks = [];
  for (const file of [...(await files('dist')), ...(await files('electron'))]) {
    const source = await readFile(file),
      packed = extractFile(path.join(output, 'resources/app.asar'), path.normalize(file));
    const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
    if (hash(source) !== hash(packed))
      throw new Error(`Packaged file differs from current build: ${file}`);
    checks.push({ file, sha256: hash(source), bytes: source.length });
  }
  await writeFile(
    path.join(output, 'build-verification.json'),
    JSON.stringify({ version: manifest.version, verified: true, checks }, null, 2),
  );
  console.log(output);
}
