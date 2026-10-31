import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractFile, listPackage } from '@electron/asar';
import { parse } from 'yaml';
import { releaseDirectory } from '../build/output.mjs';

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(file)));
    else result.push(file);
  }
  return result;
}

export async function verifyInstaller(version, repository) {
  const root = releaseDirectory(version);
  const name = `Homebase-Designer-Setup-${version}.exe`;
  const bytes = await readFile(`${root}/${name}`);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error('Setup is not a Windows executable.');
  const asar = `${root}/win-unpacked/resources/app.asar`;
  const packaged = JSON.parse(extractFile(asar, 'package.json').toString('utf8'));
  if (packaged.version !== version) throw new Error('Packaged version mismatch.');
  const handoffSource = await readFile('electron/homebase-open.json');
  const handoffMarker = await readFile(`${root}/win-unpacked/resources/homebase-open.json`);
  const handoff = JSON.parse(handoffMarker.toString('utf8'));
  if (
    !handoffSource.equals(handoffMarker) ||
    handoff.schema !== 1 ||
    handoff.argument !== '--open-homebase'
  )
    throw new Error('Packaged launcher handoff marker mismatch.');
  const entries = listPackage(asar).map((file) => file.replaceAll('\\', '/'));
  if (
    entries.some(
      (file) => /^\/(src|tests|scripts|tools|artifacts)\//.test(file) || /\.(sav|asv)$/i.test(file),
    )
  )
    throw new Error('Development files leaked into the installer.');
  extractFile(asar, path.normalize('node_modules/electron-updater/out/main.js'));
  const digest = (value, encoding = 'hex', algorithm = 'sha256') =>
    createHash(algorithm).update(value).digest(encoding);
  const checks = [];
  for (const file of [...(await files('dist')), ...(await files('electron'))]) {
    const source = await readFile(file);
    if (digest(source) !== digest(extractFile(asar, path.normalize(file))))
      throw new Error(`Packaged file mismatch: ${file}`);
    checks.push({ file, sha256: digest(source) });
  }
  const assets = [{ name, sha256: digest(bytes), size: bytes.length }];
  if (repository) {
    const config = parse(await readFile(`${root}/win-unpacked/resources/app-update.yml`, 'utf8'));
    if (
      config.provider !== 'github' ||
      config.owner !== repository.owner ||
      config.repo !== repository.repo
    )
      throw new Error('Wrong update repository in packaged app.');
    const manifest = parse(await readFile(`${root}/latest.yml`, 'utf8'));
    if (
      manifest.version !== version ||
      manifest.path !== name ||
      manifest.sha512 !== digest(bytes, 'base64', 'sha512')
    )
      throw new Error('Update manifest does not match Setup.');
    if (
      manifest.files.length !== 1 ||
      manifest.files[0].url !== name ||
      manifest.files[0].sha512 !== manifest.sha512 ||
      manifest.files[0].size !== bytes.length
    )
      throw new Error('Invalid update manifest files.');
    for (const asset of [`${name}.blockmap`, 'latest.yml']) {
      const data = await readFile(`${root}/${asset}`);
      assets.push({ name: asset, sha256: digest(data), size: data.length });
    }
  }
  const report = { version, repository, verified: true, checks, assets };
  await writeFile(`${root}/build-verification.json`, JSON.stringify(report, null, 2) + '\n');
  return report;
}
