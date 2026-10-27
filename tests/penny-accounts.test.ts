import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createCipheriv, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { PennyAccounts } = createRequire(import.meta.url)('../electron/accounts/penny-accounts.cjs');
const entry = {
  accountId: 'a'.repeat(32),
  displayName: 'Test account',
  deviceId: 'b'.repeat(32),
  secret: 'c'.repeat(32),
};
function encoded(value: string, key: Buffer) {
  const iv = randomBytes(12),
    aes = createCipheriv('aes-256-gcm', key, iv);
  return (
    'enc:v1:' +
    Buffer.concat([
      Buffer.from('v10'),
      iv,
      aes.update(value),
      aes.final(),
      aes.getAuthTag(),
    ]).toString('base64')
  );
}
it('discovers only Penny accounts with opaque renderer identifiers and no credentials', async () => {
  const reader = new PennyAccounts({
    appData: 'test-root',
    read: async () => [entry, entry, { ...entry, accountId: 'invalid' }],
  });
  const result = await reader.scan();
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0].displayName).toBe('Test account');
  expect(JSON.stringify(result)).not.toContain(entry.accountId);
  expect(JSON.stringify(result)).not.toContain(entry.secret);
  expect(await reader.credentials(result.accounts[0].id)).toEqual(entry);
  reader.clear();
  await expect(reader.credentials(result.accounts[0].id)).rejects.toThrow(/Refresh/);
});
it('decrypts Penny v10 AES-GCM using the Windows-unwrapped key and clears the key', async () => {
  const key = randomBytes(32),
    decrypted = Buffer.from(key),
    encrypted = {
      ...entry,
      deviceId: encoded(entry.deviceId, key),
      secret: encoded(entry.secret, key),
    };
  const reader = new PennyAccounts({
    appData: 'test-root',
    read: async (file: string) =>
      file.endsWith('accounts.json')
        ? [encrypted]
        : { os_crypt: { encrypted_key: Buffer.from('DPAPIfake').toString('base64') } },
    unwrap: async () => decrypted,
  });
  const list = await reader.scan();
  expect(await reader.credentials(list.accounts[0].id)).toEqual(entry);
  expect(decrypted.every((b) => b === 0)).toBe(true);
});
it('handles missing stores and malformed encryption without leaking payloads', async () => {
  const missing = new PennyAccounts({
    appData: 'test-root',
    read: async () => {
      throw Object.assign(new Error(), { code: 'ENOENT' });
    },
  });
  expect((await missing.scan()).accounts).toEqual([]);
  const reader = new PennyAccounts({
    appData: 'test-root',
    read: async (file: string) =>
      file.endsWith('accounts.json')
        ? [{ ...entry, secret: 'enc:v1:BROKEN' }]
        : { os_crypt: { encrypted_key: Buffer.from('DPAPIbad').toString('base64') } },
    unwrap: async () => randomBytes(32),
  });
  const list = await reader.scan();
  await expect(reader.credentials(list.accounts[0].id)).rejects.toThrow(
    'This Penny login could not be unlocked.',
  );
});
it.skipIf(process.platform !== 'win32')(
  'unlocks a synthetic envelope with the real Windows DPAPI pipe',
  async () => {
    const key = randomBytes(32);
    const script =
      "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $k=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $b=[Security.Cryptography.ProtectedData]::Protect($k,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($b))";
    const protectedKey = Buffer.from(
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        input: key.toString('base64'),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 4096,
      }).trim(),
      'base64',
    );
    const encrypted = {
      ...entry,
      deviceId: encoded(entry.deviceId, key),
      secret: encoded(entry.secret, key),
    };
    const reader = new PennyAccounts({
      appData: 'test-root',
      read: async (file: string) =>
        file.endsWith('accounts.json')
          ? [encrypted]
          : {
              os_crypt: {
                encrypted_key: Buffer.concat([Buffer.from('DPAPI'), protectedKey]).toString(
                  'base64',
                ),
              },
            },
    });
    const list = await reader.scan();
    expect(await reader.credentials(list.accounts[0].id)).toEqual(entry);
  },
  45000,
);
