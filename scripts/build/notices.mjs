import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(target)));
    else result.push(target);
  }
  return result;
}
export async function prepareNotices() {
  await mkdir('notices', { recursive: true });
  await copyFile('node_modules/three/LICENSE', 'notices/Three-LICENSE.txt');
  for (const [pkg, label] of [
    ['@material/web', 'Material-Web'],
    ['@material/material-color-utilities', 'Material-Color-Utilities'],
    ['@fontsource-variable/roboto', 'Roboto'],
    ['@phosphor-icons/web', 'Phosphor'],
    ['lit', 'Lit'],
    ['lit-html', 'Lit-HTML'],
    ['lit-element', 'Lit-Element'],
    ['@lit/reactive-element', 'Lit-Reactive-Element'],
  ]) {
    await copyFile(`node_modules/${pkg}/LICENSE`, `notices/${label}-LICENSE.txt`);
  }
  for (const file of await files('assets'))
    if (/LICENSE|provenance/i.test(path.basename(file))) {
      const target = path.join('notices', path.relative('assets', file));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file, target);
    }
  await copyFile('node_modules/electron-updater/LICENSE', 'notices/Electron-Updater-LICENSE.txt');
}
