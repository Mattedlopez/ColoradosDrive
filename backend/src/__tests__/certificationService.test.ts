/**
 * Unit tests for certificationService — trama cifrada A→B.
 *
 * Mocks: config (mutable), vaultClient, keycloakTokenService y supabaseAdmin.
 */

const mockConfig = {
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
  vault: { addr: 'http://vault.test:8200', token: 'vault-token-a', transitKey: 'certifications-key' },
  campusride: { apiUrl: 'http://campusride.test:3006' },
  supabase: { url: 'http://sb.test', serviceKey: 'x' },
};

jest.mock('../config', () => ({ config: mockConfig }));

jest.mock('../services/vaultClient', () => ({
  encryptWithTransit: jest.fn(),
}));

jest.mock('../services/keycloakTokenService', () => ({
  getServiceToken: jest.fn(),
}));

// supabaseAdmin: respuestas por tabla (user_profiles / exams / subjects / courses)
const singleByTable: Record<string, jest.Mock> = {};
jest.mock('../config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn().mockImplementation((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: (singleByTable[table] ??= jest.fn()),
    })),
  },
}));

import { notifyExamPassed } from '../services/certificationService';
import { encryptWithTransit } from '../services/vaultClient';
import { getServiceToken } from '../services/keycloakTokenService';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const USER_ID = 'profile-uuid-1';
const EXAM_ID = 'exam-uuid-1';

function setupHappyPath(): void {
  singleByTable['user_profiles'] = (singleByTable['user_profiles'] ?? jest.fn());
  singleByTable['user_profiles'].mockResolvedValue({
    data: { cedula: '1712345678', full_name: 'Ana Pérez', email: 'ana@test.com' },
    error: null,
  });
  (singleByTable['exams'] ??= jest.fn()).mockResolvedValue({
    data: { subject_id: null, course_id: 'course-1' },
    error: null,
  });
  (singleByTable['courses'] ??= jest.fn()).mockResolvedValue({
    data: { name: 'Tipo B' },
    error: null,
  });
  (singleByTable['subjects'] ??= jest.fn()).mockResolvedValue({ data: null, error: null });

  (encryptWithTransit as jest.Mock).mockResolvedValue('vault:v1:abc123');
  (getServiceToken as jest.Mock).mockResolvedValue('service-token');
  fetchMock.mockResolvedValue({ ok: true, status: 201, text: async () => '' } as unknown as Response);
}

describe('notifyExamPassed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.campusride.apiUrl = 'http://campusride.test:3006';
    mockConfig.vault.addr = 'http://vault.test:8200';
    setupHappyPath();
  });

  it('is a no-op (with warning) when CAMPUSRIDE_API_URL is not configured', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockConfig.campusride.apiUrl = '';

    await notifyExamPassed(USER_ID, EXAM_ID, 95);

    expect(warnSpy).toHaveBeenCalled();
    expect(encryptWithTransit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('is a no-op (with warning) when VAULT_ADDR is not configured', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockConfig.vault.addr = '';

    await notifyExamPassed(USER_ID, EXAM_ID, 95);

    expect(warnSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('encrypts the contract payload {cedula, nombre, email, tipoLicencia, resultado, fecha}', async () => {
    await notifyExamPassed(USER_ID, EXAM_ID, 95);

    expect(encryptWithTransit).toHaveBeenCalledTimes(1);
    const plaintext = (encryptWithTransit as jest.Mock).mock.calls[0][0] as string;
    const payload = JSON.parse(plaintext) as Record<string, unknown>;

    expect(payload).toEqual({
      cedula: '1712345678',
      nombre: 'Ana Pérez',
      email: 'ana@test.com',
      tipoLicencia: 'Tipo B',
      resultado: 'aprobado',
      fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('POSTs {ciphertext} to /api/certifications with the service Bearer token', async () => {
    await notifyExamPassed(USER_ID, EXAM_ID, 95);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://campusride.test:3006/api/certifications');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer service-token');
    expect(JSON.parse(String(init.body))).toEqual({ ciphertext: 'vault:v1:abc123' });
  });

  it('resolves tipoLicencia via subject → course when the exam has no course_id', async () => {
    singleByTable['exams'].mockResolvedValue({
      data: { subject_id: 'subject-1', course_id: null },
      error: null,
    });
    singleByTable['subjects'].mockResolvedValue({ data: { course_id: 'course-1' }, error: null });

    await notifyExamPassed(USER_ID, EXAM_ID, 90);

    const payload = JSON.parse((encryptWithTransit as jest.Mock).mock.calls[0][0] as string) as {
      tipoLicencia: string;
    };
    expect(payload.tipoLicencia).toBe('Tipo B');
  });

  it('throws when CampusRide responds non-2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom',
    } as unknown as Response);

    await expect(notifyExamPassed(USER_ID, EXAM_ID, 95)).rejects.toThrow(/500/);
  });

  it('throws when the student profile does not exist', async () => {
    singleByTable['user_profiles'].mockResolvedValue({ data: null, error: { message: 'not found' } });

    await expect(notifyExamPassed(USER_ID, EXAM_ID, 95)).rejects.toThrow(/perfil/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
