import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { EpicAccount, safeVerificationUrl, zonesFrom } = createRequire(import.meta.url)(
  '../electron/accounts/epic-account.cjs',
);
const id = 'a'.repeat(32),
  metadata = {
    profileChanges: [
      {
        profile: {
          items: {
            zone: {
              templateId: 'Outpost:outpostcore_pve_04',
              attributes: {
                level: 10,
                cloud_save_info: { savedRecords: [{ recordFilename: 'home_r0_a1.sav' }] },
              },
            },
          },
        },
      },
    ],
  };
function harness({ denied = false, pending = false, metadataFailure = false } = {}) {
  const requests: {
      url: string;
      method: string;
      body: URLSearchParams;
      authorization: string;
    }[] = [],
    states: unknown[] = [],
    opened: string[] = [],
    waits: number[] = [];
  let now = 0,
    polls = 0;
  const fetch = async (url: string, init: RequestInit) => {
    const body = new URLSearchParams(String(init.body ?? '')),
      headers = init.headers as Record<string, string>;
    requests.push({
      url,
      method: init.method ?? 'GET',
      body,
      authorization: headers.Authorization,
    });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.endsWith('/token'))
      switch (body.get('grant_type')) {
        case 'client_credentials':
          return json({ access_token: 'BOOTSTRAP_SECRET' });
        case 'device_code':
          polls++;
          if (denied)
            return json({ errorCode: 'errors.com.epicgames.account.oauth.access_denied' }, 400);
          if (pending && polls === 1)
            return json(
              { errorCode: 'errors.com.epicgames.account.oauth.authorization_pending' },
              400,
            );
          if (pending && polls === 2)
            return json({ errorCode: 'errors.com.epicgames.account.oauth.slow_down' }, 400);
          return json({ access_token: 'SWITCH_SECRET' });
        case 'exchange_code':
          return json({
            account_id: id,
            access_token: 'ACCESS_SECRET',
            refresh_token: 'REFRESH_SECRET',
            displayName: 'Test player',
            expires_in: 3600,
          });
        case 'device_auth':
          return json({
            account_id: id,
            access_token: 'ACCESS_SECRET',
            refresh_token: 'REFRESH_SECRET',
            displayName: 'Test player',
            expires_in: 3600,
          });
        case 'refresh_token':
          return json({
            account_id: id,
            access_token: 'RENEWED_SECRET',
            refresh_token: 'NEW_REFRESH_SECRET',
            expires_in: 3600,
          });
      }
    if (url.endsWith('/deviceAuthorization'))
      return json({
        device_code: 'DEVICE_SECRET',
        user_code: 'ABCD1234',
        verification_uri_complete: 'https://www.epicgames.com/activate?userCode=ABCD1234',
        expires_in: 300,
        interval: 5,
      });
    if (url.endsWith('/exchange')) return json({ code: 'EXCHANGE_SECRET' });
    if (url.includes('QueryProfile'))
      return metadataFailure
        ? json({ errorCode: 'errors.com.epicgames.account.forbidden' }, 403)
        : json(metadata);
    if (url.endsWith('/home_r0_a1.sav')) return new Response('SavedActors fake fixture');
    if (url.includes('/cloudstorage/user/'))
      return json([{ filename: 'home_r0_a1.sav', uploaded: '2026-10-26T10:00:00Z' }]);
    throw new Error('Unexpected test endpoint');
  };
  const account = new EpicAccount({
    fetch,
    openExternal: async (u: string) => {
      opened.push(u);
    },
    onState: (s: unknown) => states.push(s),
    wait: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
    now: () => now,
  });
  return {
    account,
    requests,
    states,
    opened,
    waits,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
it('performs device login, approved token exchange, read-only metadata/listing and zone download', async () => {
  const h = harness({ pending: true });
  expect(h.requests).toHaveLength(0);
  await h.account.login();
  expect(h.account.getState()).toMatchObject({ status: 'signed-in', displayName: 'Test player' });
  expect(h.waits).toEqual([5000, 5000, 10000]);
  expect(h.opened).toHaveLength(1);
  const result = await h.account.download('pve_04');
  expect(result.zone.name).toBe('Twine Peaks');
  expect(new TextDecoder().decode(result.bytes)).toContain('SavedActors');
  expect(JSON.stringify(h.states)).not.toMatch(
    /DEVICE_SECRET|ACCESS_SECRET|REFRESH_SECRET|EXCHANGE_SECRET|BOOTSTRAP_SECRET|SWITCH_SECRET/,
  );
  expect(
    h.requests.every(
      (r) =>
        r.url.startsWith('https://account-public-service-prod03.ol.epicgames.com/') ||
        r.url.startsWith('https://fngw-mcp-gc-livefn.ol.epicgames.com/'),
    ),
  ).toBe(true);
  expect(
    h.requests
      .filter((r) => r.method === 'POST' && !r.url.includes('/oauth/'))
      .every((r) => r.url.includes('/client/QueryProfile?profileId=metadata')),
  ).toBe(true);
});
it('limits downloads to listed zones and clears session credentials on sign-out', async () => {
  const h = harness();
  await h.account.login();
  await expect(h.account.download('../another-account/file.sav')).rejects.toThrow(/Choose/);
  await expect(h.account.download('pve_01')).rejects.toThrow(/available/);
  h.account.cancel();
  expect(h.account.getState()).toMatchObject({ status: 'signed-out', zones: [] });
  await expect(h.account.download('pve_04')).rejects.toThrow(/Sign in/);
});
it('refreshes expiring sessions without exposing tokens', async () => {
  const h = harness();
  await h.account.login();
  h.advance(3600000);
  await h.account.download('pve_04');
  expect(h.requests.some((r) => r.body.get('grant_type') === 'refresh_token')).toBe(true);
  expect(h.requests.at(-1)?.authorization).toBe('bearer RENEWED_SECRET');
  expect(JSON.stringify(h.account.getState())).not.toContain('SECRET');
});
it('shows denial and metadata failures accurately and allows listing retry after login', async () => {
  const denied = harness({ denied: true });
  await denied.account.login();
  expect(denied.account.getState()).toMatchObject({
    status: 'error',
    error: 'Sign-in was declined.',
  });
  const meta = harness({ metadataFailure: true });
  await meta.account.login();
  expect(meta.account.getState()).toMatchObject({ status: 'signed-in', zones: [], loading: false });
  expect(meta.account.getState().error).toMatch(/denied/);
});
it('rejects foreign browser URLs and unsafe cloud filenames', () => {
  for (const url of [
    'http://www.epicgames.com/activate',
    'https://www.epicgames.com.evil.test/activate',
    'https://evil.test/activate',
    'https://www.epicgames.com@evil.test/activate',
    'https://www.epicgames.com/other',
    'https://user:secret@www.epicgames.com/activate',
  ])
    expect(safeVerificationUrl(url)).toBeNull();
  expect(safeVerificationUrl('https://www.epicgames.com/activate?userCode=TEST')).toBeTruthy();
  const bad = structuredClone(metadata);
  bad.profileChanges[0].profile.items.zone.attributes.cloud_save_info.savedRecords[0].recordFilename =
    '../other.sav';
  expect(zonesFrom(bad).every((z: any) => !z.available)).toBe(true);
});
it('cancels pending login without publishing a later authenticated session', async () => {
  const h = harness();
  h.account.onState = (s: any) => {
    h.states.push(s);
    if (s.status === 'waiting') h.account.cancel();
  };
  await h.account.login();
  expect(h.account.getState().status).toBe('signed-out');
  expect(h.requests.some((r) => r.body.get('grant_type') === 'device_code')).toBe(false);
  expect(h.opened).toHaveLength(0);
});
it('uses an imported Penny account only for Epic device authentication', async () => {
  const h = harness();
  await h.account.loginPenny(async () => ({
    accountId: id,
    deviceId: 'b'.repeat(32),
    secret: 'PENNY_SECRET',
    displayName: 'Saved account',
  }));
  expect(h.account.getState().status).toBe('signed-in');
  expect(h.requests[0].body.get('grant_type')).toBe('device_auth');
  expect(h.requests[0].body.get('secret')).toBe('PENNY_SECRET');
  expect(h.opened).toEqual([]);
  expect(JSON.stringify(h.states)).not.toContain('SECRET');
});
it('does not continue Penny sign-in after cancellation during credential unlock', async () => {
  const h = harness();
  await h.account.loginPenny(async () => {
    h.account.cancel();
    return { accountId: id, deviceId: 'b'.repeat(32), secret: 'PENNY_SECRET' };
  });
  expect(h.requests).toEqual([]);
  expect(h.account.getState().status).toBe('signed-out');
});
