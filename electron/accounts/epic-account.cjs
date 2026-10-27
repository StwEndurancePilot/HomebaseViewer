const { EpicError } = require('./epic-error.cjs');
const zlib = require('node:zlib');
const ACCOUNT = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth';
const GAME = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api';
const SWITCH =
  'OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3';
const ANDROID =
  'M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';
const NAMES = {
  pve_01: 'Stonewood',
  pve_02: 'Plankerton',
  pve_03: 'Canny Valley',
  pve_04: 'Twine Peaks',
};
const MAX_DOWNLOAD = 128 * 1024 * 1024,
  MAX_INFLATED = 256 * 1024 * 1024;
function safeVerificationUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      ['www.epicgames.com', 'epicgames.com'].includes(u.hostname) &&
      u.pathname === '/activate' &&
      !u.username &&
      !u.password &&
      !u.port
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function decodeCloudBytes(value) {
  let b = Buffer.from(value);
  if (b.length > MAX_DOWNLOAD) throw new Error('Cloud save exceeds 128 MiB.');
  try {
    if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b, { maxOutputLength: MAX_INFLATED });
    if (b.subarray(0, 4).toString('ascii') === 'ECFD') {
      if (b.length < 18) throw new Error();
      b = zlib.inflateSync(b.subarray(16), { maxOutputLength: MAX_INFLATED });
    }
  } catch {
    throw new Error('The cloud archive is damaged or exceeds the decompression limit.');
  }
  if (b.length > MAX_INFLATED) throw new Error('Decoded cloud archive exceeds 256 MiB.');
  return new Uint8Array(b);
}
function zonesFrom(metadata, listing = []) {
  const profile = metadata?.profileChanges?.find((c) => c.profile)?.profile;
  if (!profile || !profile.items || typeof profile.items !== 'object')
    throw new Error('Epic returned no homebase metadata.');
  const files = new Map(
    (Array.isArray(listing) ? listing : []).map((f) => [f.uniqueFilename ?? f.filename, f]),
  );
  return Object.entries(NAMES).map(([id, name]) => {
    const item = Object.values(profile.items).find(
      (i) => i?.templateId?.toLowerCase() === `outpost:outpostcore_${id}`,
    );
    const raw =
      item?.attributes?.cloud_save_info?.savedRecords?.find(
        (r) => typeof r?.recordFilename === 'string',
      )?.recordFilename ?? '';
    const file =
      /^[A-Za-z0-9_.-]{1,180}\.(?:sav|asv)$/i.test(raw) && !raw.includes('..') ? raw : '';
    const info = files.get(file);
    return {
      id,
      name,
      file,
      available: !!file,
      level: Number(item?.attributes?.level) || 0,
      updated: typeof info?.uploaded === 'string' ? info.uploaded : null,
    };
  });
}
function abortWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Cancelled'));
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}
class EpicAccount {
  constructor({
    fetch: fetchImpl = globalThis.fetch,
    openExternal,
    onState = () => {},
    wait = abortWait,
    now = Date.now,
  } = {}) {
    this.fetch = fetchImpl;
    this.openExternal = openExternal;
    this.onState = onState;
    this.wait = wait;
    this.now = now;
    this.session = null;
    this.abort = null;
    this.refreshing = null;
    this.state = { status: 'signed-out', zones: [] };
  }
  getState() {
    return structuredClone(this.state);
  }
  publish(state) {
    this.state = { ...this.state, ...state };
    this.onState(this.getState());
  }
  async request(
    url,
    {
      method = 'GET',
      token,
      basic,
      form,
      json,
      signal,
      maxBytes = 16 * 1024 * 1024,
      binary = false,
    } = {},
  ) {
    if (!url.startsWith(ACCOUNT + '/') && !url.startsWith(GAME + '/'))
      throw new Error('Unsupported Epic endpoint.');
    const headers = { Accept: binary ? 'application/octet-stream' : 'application/json' };
    if (token) headers.Authorization = `bearer ${token}`;
    if (basic) headers.Authorization = `basic ${basic}`;
    let body;
    if (form) {
      body = new URLSearchParams(form).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (json) {
      body = JSON.stringify(json);
      headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.any([
          signal ?? new AbortController().signal,
          AbortSignal.timeout(binary ? 60000 : 20000),
        ]),
      });
    } catch {
      throw new Error(
        signal?.aborted ? 'Cancelled' : 'Could not reach Epic. Check your connection and retry.',
      );
    }
    const cap = response.ok ? maxBytes : 64 * 1024,
      declared = Number(response.headers.get('content-length'));
    if (declared > cap) throw new Error('Epic response exceeds the download limit.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Epic returned an empty response.');
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > cap) {
          await reader.cancel();
          throw new Error('Epic response exceeds the download limit.');
        }
        parts.push(value);
      }
    } catch (error) {
      if (error.message === 'Epic response exceeds the download limit.') throw error;
      throw new Error('Download interrupted. Retry when connected.');
    }
    const bytes = Buffer.concat(parts.map((p) => Buffer.from(p)));
    let data;
    if (!binary || !response.ok) {
      try {
        data = JSON.parse(bytes.toString('utf8'));
      } catch {
        if (response.ok) throw new Error('Epic returned an invalid response.');
      }
    }
    if (!response.ok) throw new EpicError(response.status, data?.errorCode ?? data?.error);
    return binary ? new Uint8Array(bytes) : data;
  }
  token(form, basic, signal) {
    return this.request(ACCOUNT + '/token', {
      method: 'POST',
      form,
      basic,
      signal,
      maxBytes: 64 * 1024,
    });
  }
  cancel() {
    this.abort?.abort();
    this.abort = null;
    this.session = null;
    this.refreshing = null;
    this.publish({
      status: 'signed-out',
      displayName: null,
      zones: [],
      verificationUri: null,
      userCode: null,
      error: null,
      loading: false,
      expiresAt: null,
    });
  }
  async login() {
    this.cancel();
    const controller = new AbortController();
    this.abort = controller;
    const signal = controller.signal,
      current = () => this.abort === controller && !signal.aborted;
    this.publish({ status: 'starting' });
    try {
      const boot = await this.token({ grant_type: 'client_credentials' }, SWITCH, signal);
      if (!boot.access_token) throw new Error('Epic did not issue a login session.');
      const device = await this.request(ACCOUNT + '/deviceAuthorization', {
        method: 'POST',
        form: {},
        token: boot.access_token,
        signal,
        maxBytes: 64 * 1024,
      });
      if (!current()) return;
      const verificationUri = safeVerificationUrl(device.verification_uri_complete);
      if (!verificationUri || typeof device.device_code !== 'string' || !device.device_code)
        throw new Error('Epic returned an invalid sign-in page.');
      const expiresAt =
        this.now() + Math.min(Math.max(Number(device.expires_in) || 300, 1), 600) * 1000;
      this.publish({
        status: 'waiting',
        verificationUri,
        userCode: typeof device.user_code === 'string' ? device.user_code.slice(0, 32) : null,
        expiresAt,
      });
      if (!current()) return;
      await this.openExternal(verificationUri);
      let interval = Math.max(Number(device.interval) || 5, 5),
        switchToken;
      while (current() && this.now() < expiresAt) {
        await this.wait(interval * 1000, signal);
        if (!current() || this.now() >= expiresAt) break;
        try {
          switchToken = await this.token(
            { grant_type: 'device_code', device_code: device.device_code },
            SWITCH,
            signal,
          );
          break;
        } catch (e) {
          if (
            e instanceof EpicError &&
            (e.code.endsWith('authorization_pending') ||
              e.code === 'errors.com.epicgames.not_found')
          )
            continue;
          if (e instanceof EpicError && e.code.endsWith('slow_down')) {
            interval += 5;
            continue;
          }
          throw e;
        }
      }
      if (!current()) return;
      if (!switchToken?.access_token) throw new Error('Sign-in expired. Start again.');
      this.publish({ status: 'signing-in', verificationUri: null, userCode: null });
      const exchange = await this.request(ACCOUNT + '/exchange', {
        token: switchToken.access_token,
        signal,
        maxBytes: 64 * 1024,
      });
      if (typeof exchange.code !== 'string' || !exchange.code)
        throw new Error('Epic did not issue an exchange code.');
      const credentials = await this.token(
        { grant_type: 'exchange_code', exchange_code: exchange.code },
        ANDROID,
        signal,
      );
      if (!current()) return;
      if (
        !/^[a-f0-9]{32}$/i.test(credentials.account_id ?? '') ||
        typeof credentials.access_token !== 'string'
      )
        throw new Error('Epic did not return a valid account session.');
      this.session = {
        accountId: credentials.account_id,
        token: credentials.access_token,
        refresh: credentials.refresh_token,
        expires: this.now() + (Number(credentials.expires_in) || 3600) * 1000,
      };
      this.publish({
        status: 'signed-in',
        displayName:
          typeof credentials.displayName === 'string'
            ? credentials.displayName
            : typeof credentials.display_name === 'string'
              ? credentials.display_name
              : 'Epic account',
        error: null,
      });
      await this.list();
    } catch (e) {
      if (current()) {
        if (this.session) this.publish({ status: 'signed-in', loading: false, error: e.message });
        else
          this.publish({
            status: 'error',
            displayName: null,
            zones: [],
            verificationUri: null,
            userCode: null,
            error:
              e instanceof EpicError && e.code.includes('access_denied')
                ? 'Sign-in was declined.'
                : e.message,
          });
      }
    }
  }
  async loginPenny(resolveCredentials) {
    this.cancel();
    const controller = new AbortController();
    this.abort = controller;
    const signal = controller.signal,
      current = () => this.abort === controller && !signal.aborted;
    this.publish({ status: 'signing-in' });
    try {
      const saved = await resolveCredentials();
      if (!current()) return;
      const credentials = await this.token(
        {
          grant_type: 'device_auth',
          account_id: saved.accountId,
          device_id: saved.deviceId,
          secret: saved.secret,
        },
        ANDROID,
        signal,
      );
      if (!current()) return;
      if (
        credentials.account_id?.toLowerCase() !== saved.accountId.toLowerCase() ||
        typeof credentials.access_token !== 'string' ||
        !credentials.access_token
      )
        throw new Error('Epic returned an unexpected account session.');
      this.session = {
        accountId: credentials.account_id,
        token: credentials.access_token,
        refresh: credentials.refresh_token,
        expires: this.now() + (Number(credentials.expires_in) || 3600) * 1000,
      };
      this.publish({
        status: 'signed-in',
        displayName:
          typeof credentials.displayName === 'string' ? credentials.displayName : saved.displayName,
        error: null,
      });
      await this.list();
    } catch (e) {
      if (current()) {
        if (this.session) this.publish({ status: 'signed-in', loading: false, error: e.message });
        else
          this.publish({
            status: 'error',
            loading: false,
            error:
              e instanceof EpicError
                ? 'Epic rejected this saved Penny login. Sign in again in Penny, or use Sign in with Epic.'
                : e.message,
          });
      }
    }
  }
  async credentials() {
    const session = this.session,
      controller = this.abort;
    if (!session || !controller || controller.signal.aborted)
      throw new Error('Sign in to Epic first.');
    if (session.expires < this.now() + 30000) {
      if (!session.refresh) throw new Error('Epic session expired. Sign in again.');
      if (!this.refreshing)
        this.refreshing = (async () => {
          const next = await this.token(
            { grant_type: 'refresh_token', refresh_token: session.refresh },
            ANDROID,
            controller.signal,
          );
          if (this.session !== session || controller.signal.aborted) throw new Error('Cancelled');
          if (!next.access_token || next.account_id !== session.accountId)
            throw new Error('Epic session changed. Sign in again.');
          session.token = next.access_token;
          session.refresh = next.refresh_token ?? session.refresh;
          session.expires = this.now() + (Number(next.expires_in) || 3600) * 1000;
        })().finally(() => {
          this.refreshing = null;
        });
      await this.refreshing;
    }
    return { session, signal: controller.signal };
  }
  async list() {
    const { session, signal } = await this.credentials();
    if (this.session !== session || signal.aborted) throw new Error('Cancelled');
    this.publish({ loading: true, error: null });
    try {
      const [metadata, listing] = await Promise.allSettled([
        this.request(
          `${GAME}/game/v2/profile/${session.accountId}/client/QueryProfile?profileId=metadata&rvn=-1`,
          { method: 'POST', json: {}, token: session.token, signal },
        ),
        this.request(`${GAME}/cloudstorage/user/${session.accountId}`, {
          token: session.token,
          signal,
        }),
      ]);
      if (this.session !== session || signal.aborted) throw new Error('Cancelled');
      if (metadata.status === 'rejected') throw metadata.reason;
      const zones = zonesFrom(metadata.value, listing.status === 'fulfilled' ? listing.value : []);
      this.publish({ zones, loading: false, error: null });
      return zones;
    } catch (e) {
      if (this.session === session && !signal.aborted)
        this.publish({ loading: false, error: e.message });
      throw e;
    }
  }
  async download(zoneId) {
    const { session, signal } = await this.credentials(),
      zone = this.state.zones.find((z) => z.id === zoneId && z.available);
    if (!zone) throw new Error('Choose an available homebase from this account.');
    const raw = await this.request(
      `${GAME}/cloudstorage/user/${session.accountId}/${encodeURIComponent(zone.file)}`,
      { token: session.token, signal, binary: true, maxBytes: MAX_DOWNLOAD },
    );
    if (this.session !== session || signal.aborted) throw new Error('Cancelled');
    return { zone: structuredClone(zone), bytes: decodeCloudBytes(raw), sourceBytes: raw.length };
  }
  async reopen() {
    const url = safeVerificationUrl(this.state.verificationUri);
    if (this.state.status !== 'waiting' || !url) throw new Error('Start sign-in first.');
    await this.openExternal(url);
  }
}
module.exports = { EpicAccount, decodeCloudBytes, safeVerificationUrl, zonesFrom };
