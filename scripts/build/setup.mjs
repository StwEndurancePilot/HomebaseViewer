import { readFile } from 'node:fs/promises';
import { build, Platform, Arch } from 'electron-builder';
import { prepareNotices } from './notices.mjs';
import { resolveRepository } from '../release/repository.mjs';
import { installerConfig } from './installer-config.mjs';
import { verifyInstaller } from '../release/verify-installer.mjs';
import { releaseDirectory } from './output.mjs';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const repository = resolveRepository(process.argv.includes('--release'));
await prepareNotices();
await build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  config: installerConfig(repository, manifest.version),
  publish: 'never',
});
await verifyInstaller(manifest.version, repository);
console.log(
  `Setup: ${releaseDirectory(manifest.version)}/Homebase-Viewer-Setup-${manifest.version}.exe`,
);
if (!repository)
  console.log('Local installer: configure a GitHub repository for automatic updates.');
