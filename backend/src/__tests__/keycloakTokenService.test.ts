/**
 * Unit tests for keycloakTokenService — client_credentials token cache.
 */

jest.mock('../config', () => ({
  config: {
    keycloak: {
      url: 'http://kc.test',
      realm: 'udla8',
      audience: 'colorados-api',
      serviceClientId: 'colorados-service',
      serviceClientSecret: 'test-secret',
      issuer: 'http://kc.test/realms/udla8',
      jwksUrl: 'http://kc.test/realms/udla8/protocol/openid-connect/certs',
      tokenUrl: 'http://kc.test/realms/udla8/protocol/openid-connect/token',
      adminApiUrl: 'http://kc.test/admin/realms/udla8',
    },
    vault: { addr: '', token: '', transitKey: 'certifications-key' },
    campusride: { apiUrl: '' },
    supabase: { url: 'http://sb.test', serviceKey: 'x' },
  },
}));

import { getServiceToken, clearServiceTokenCache } from '../services/keycloakTokenService';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function tokenResponse(token: string, expiresIn: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_in: expiresIn }),
    text: async () => '',
  } as unknown as Response;
}

describe('getServiceToken', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    clearServiceTokenCache();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('requests a token via client_credentials and caches it', async () => {
    fetchMock.mockResolvedValue(tokenResponse('token-1', 300));

    const first = await getServiceToken();
    const second = await getServiceToken();

    expect(first).toBe('token-1');
    expect(second).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://kc.test/realms/udla8/protocol/openid-connect/token');
    const body = String(init.body);
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=colorados-service');
    expect(body).toContain('client_secret=test-secret');
  });

  it('refreshes the token when it is about to expire (30s safety margin)', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('token-1', 60))
      .mockResolvedValueOnce(tokenResponse('token-2', 300));

    const first = await getServiceToken();
    expect(first).toBe('token-1');

    // Avanzar el reloj a 35 s: quedan 25 s de vida (< margen de 30 s) → refetch.
    nowSpy.mockReturnValue(1_000_000 + 35_000);
    const second = await getServiceToken();

    expect(second).toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the cached token while it is still fresh', async () => {
    fetchMock.mockResolvedValue(tokenResponse('token-1', 300));

    await getServiceToken();
    // 200 s después: quedan 100 s (> margen) → sigue en caché.
    nowSpy.mockReturnValue(1_000_000 + 200_000);
    const token = await getServiceToken();

    expect(token).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws with a clear message on non-2xx responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
      text: async () => '{"error":"invalid_client"}',
    } as unknown as Response);

    await expect(getServiceToken()).rejects.toThrow(/client_credentials falló \(401\)/);
  });
});
