const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createDecipheriv } = require('node:crypto');
const { execFile } = require('node:child_process');
const hex = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value);
async function readJson(file) {
  const handle = await fs.open(file, 'r');
  try {
    if ((await handle.stat()).size > 2000000) throw new Error('Too large');
    return JSON.parse(await handle.readFile('utf8'));
  } finally {
    await handle.close();
  }
}
function unprotect(envelope) {
  if (process.platform !== 'win32')
    return Promise.reject(new Error('Windows account encryption is required.'));
  const script =
    "$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $k=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($k)); [Array]::Clear($k,0,$k.Length) } catch { exit 1 }";
  return new Promise((resolve, reject) => {
    const child = execFile(
      path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 4096 },
      (error, stdout) => {
        if (error)
          return reject(
            new Error('Penny credentials could not be unlocked for this Windows user.'),
          );
        resolve(Buffer.from(stdout.trim(), 'base64'));
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end(envelope.toString('base64'));
  });
}
function decrypt(value, key) {
  if (!value.startsWith('enc:v1:')) return value;
  if (!/^enc:v1:[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid encrypted credential');
  const bytes = Buffer.from(value.slice(7), 'base64');
  if (bytes.length < 31 || bytes.subarray(0, 3).toString() !== 'v10' || key.length !== 32)
    throw new Error('Unsupported encryption');
  const aes = createDecipheriv('aes-256-gcm', key, bytes.subarray(3, 15));
  aes.setAuthTag(bytes.subarray(-16));
  const clear = Buffer.concat([aes.update(bytes.subarray(15, -16)), aes.final()]);
  try {
    return clear.toString('utf8');
  } finally {
    clear.fill(0);
  }
}
class PennyAccounts {
  constructor({ appData, read = readJson, unwrap = unprotect } = {}) {
    this.root = appData;
    this.read = read;
    this.unwrap = unwrap;
    this.accounts = new Map();
  }
  async scan() {
    this.accounts.clear();
    let data;
    try {
      data = await this.read(path.join(this.root, 'penny-launcher-data', 'accounts.json'));
    } catch (e) {
      if (e.code === 'ENOENT') return { accounts: [], message: 'No Penny accounts found.' };
      throw new Error('Couldn’t read Penny accounts. Check them in Penny.');
    }
    if (!Array.isArray(data) || data.length > 1000)
      throw new Error('Penny account data is not supported.');
    const seen = new Set();
    let skipped = 0;
    for (const entry of data) {
      const name = typeof entry?.displayName === 'string' ? entry.displayName.trim() : '';
      if (
        !hex(entry?.accountId) ||
        !name ||
        name.length > 100 ||
        /[\x00-\x1f\x7f]/.test(name) ||
        typeof entry.deviceId !== 'string' ||
        typeof entry.secret !== 'string' ||
        entry.deviceId.length > 2048 ||
        entry.secret.length > 2048 ||
        (!hex(entry.deviceId) && !entry.deviceId.startsWith('enc:v1:')) ||
        (!/^[a-zA-Z0-9]{32}$/.test(entry.secret) && !entry.secret.startsWith('enc:v1:'))
      ) {
        skipped++;
        continue;
      }
      if (seen.has(entry.accountId.toLowerCase())) continue;
      seen.add(entry.accountId.toLowerCase());
      this.accounts.set(randomUUID(), {
        accountId: entry.accountId,
        displayName: name,
        deviceId: entry.deviceId,
        secret: entry.secret,
      });
    }
    return {
      accounts: [...this.accounts].map(([id, a]) => ({ id, displayName: a.displayName })),
      message: skipped ? `${skipped} unreadable Penny entries skipped.` : '',
    };
  }
  async credentials(id) {
    const entry = this.accounts.get(id);
    if (!entry) throw new Error('Refresh Penny accounts and choose an account.');
    let key;
    try {
      if ([entry.deviceId, entry.secret].some((v) => v.startsWith('enc:v1:'))) {
        const state = await this.read(path.join(this.root, 'Penny', 'Local State'));
        const encoded = state?.os_crypt?.encrypted_key;
        if (typeof encoded !== 'string' || encoded.length > 16384) throw new Error();
        const envelope = Buffer.from(encoded, 'base64');
        if (envelope.subarray(0, 5).toString() !== 'DPAPI') throw new Error();
        key = await this.unwrap(envelope.subarray(5));
      }
      const deviceId = decrypt(entry.deviceId, key),
        secret = decrypt(entry.secret, key);
      if (!hex(deviceId) || !/^[a-zA-Z0-9]{32}$/.test(secret)) throw new Error();
      return { accountId: entry.accountId, displayName: entry.displayName, deviceId, secret };
    } catch {
      throw new Error(
        'This Penny login could not be unlocked. Sign in again in Penny, then refresh.',
      );
    } finally {
      key?.fill(0);
    }
  }
  clear() {
    this.accounts.clear();
  }
}
module.exports = { PennyAccounts, decrypt };
