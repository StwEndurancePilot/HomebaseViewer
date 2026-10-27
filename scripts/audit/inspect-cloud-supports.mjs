import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url),
  { PennyAccounts } = require('../../electron/accounts/penny-accounts.cjs'),
  { EpicAccount } = require('../../electron/accounts/epic-account.cjs');
const index = Number(process.argv.find((a) => a.startsWith('--account='))?.split('=')[1] ?? 0);
const target = `artifacts/validation/live-cloud-supports${index ? '-' + index : ''}.bin`;
if (process.argv.includes('--download')) {
  const store = new PennyAccounts({ appData: process.env.APPDATA }),
    account = new EpicAccount({
      openExternal: async () => {
        throw new Error('Browser flow not used');
      },
    });
  try {
    const list = await store.scan();
    if (!list.accounts[index]) throw new Error('No saved Penny account');
    await account.loginPenny(() => store.credentials(list.accounts[index].id));
    const state = account.getState();
    if (state.status !== 'signed-in') throw new Error(state.error || 'Account login failed');
    const zone =
      state.zones.find((z) => z.id === 'pve_04' && z.available) ??
      state.zones.find((z) => z.available);
    if (!zone) throw new Error('No homebase backup');
    const data = await account.download(zone.id);
    await mkdir('artifacts/validation', { recursive: true });
    await writeFile(target, data.bytes);
    await writeFile(target + '.json', JSON.stringify({ zoneId: zone.id }));
    console.log(JSON.stringify({ downloaded: true, zone: zone.id, bytes: data.bytes.length }));
  } finally {
    account.cancel();
    store.clear();
  }
}
const bytes = await readFile(target),
  text = bytes.toString('latin1');
for (const name of [
  'AttachedTo',
  'AttachedToSide',
  'OriginalTrapLevel',
  'SavedActorGuid',
  'ActorGuid',
]) {
  const offsets = [...text.matchAll(new RegExp(name + '\x00', 'g'))].map((m) => m.index);
  console.log(
    JSON.stringify({
      property: name,
      count: offsets.length,
      samples: offsets.slice(0, 2).map((at) => ({
        at,
        hex: bytes.subarray(at - 4, at + 180).toString('hex'),
        text: text.slice(at, at + 180).replace(/[^\x20-\x7e]/g, '.'),
      })),
    }),
  );
}
