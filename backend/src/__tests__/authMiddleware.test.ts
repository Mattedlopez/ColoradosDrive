/**
 * Unit tests for the auth middleware — Keycloak OIDC + perfil local.
 *
 * Casos: match por keycloak_sub, fallback por email con self-heal,
 * perfil inexistente → 401, y prioridad del rol de realm sobre el de BD.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../config/keycloak', () => ({
  verifyKeycloakToken: jest.fn(),
}));

const mockSubMaybeSingle = jest.fn();
const mockEmailMaybeSingle = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();

jest.mock('../config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn().mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: mockSubMaybeSingle }),
        ilike: jest.fn().mockReturnValue({ maybeSingle: mockEmailMaybeSingle }),
      }),
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: mockUpdateEq };
      },
    })),
  },
}));

import { authMiddleware } from '../middleware/auth';
import { verifyKeycloakToken } from '../config/keycloak';

// ─── Harness ─────────────────────────────────────────────────────────────────

const SUB = 'kc-sub-uuid-1';

const baseProfile = {
  id: 'profile-uuid-1',
  email: 'ana@test.com',
  full_name: 'Ana Pérez',
  role: 'student',
  course_id: 'course-1',
  cohort_id: null,
  instructor_id: null,
  keycloak_sub: SUB,
  cohorts: null,
};

function makeReq(token: string | null = 'valid-token'): AuthenticatedRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as AuthenticatedRequest;
}

function makeRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('authMiddleware (Keycloak)', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
    (verifyKeycloakToken as jest.Mock).mockResolvedValue({
      sub: SUB,
      email: 'ana@test.com',
      realmRoles: ['student'],
      raw: {},
    });
  });

  it('responds 401 when there is no Bearer token', async () => {
    const req = makeReq(null);
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('builds req.user from the profile found by keycloak_sub (id = profile PK)', async () => {
    mockSubMaybeSingle.mockResolvedValue({ data: baseProfile, error: null });
    const req = makeReq();
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      id: 'profile-uuid-1',
      email: 'ana@test.com',
      fullName: 'Ana Pérez',
      role: 'student',
      courseId: 'course-1',
      cohortId: null,
      instructorId: null,
    });
    // Sin self-heal cuando entra por sub.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('falls back to email lookup and self-heals the keycloak_sub', async () => {
    mockSubMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockEmailMaybeSingle.mockResolvedValue({
      data: { ...baseProfile, keycloak_sub: null },
      error: null,
    });
    const req = makeReq();
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe('profile-uuid-1');
    // Self-heal: persiste el sub para las siguientes peticiones.
    expect(mockUpdate).toHaveBeenCalledWith({ keycloak_sub: SUB });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'profile-uuid-1');
  });

  it('responds 401 when no profile matches sub nor email', async () => {
    mockSubMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockEmailMaybeSingle.mockResolvedValue({ data: null, error: null });
    const req = makeReq();
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Perfil de usuario no encontrado') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 when the token is invalid or expired', async () => {
    const err = new Error('expired');
    err.name = 'JWTExpired';
    (verifyKeycloakToken as jest.Mock).mockRejectedValue(err);
    const req = makeReq();
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Sesión expirada') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('gives the realm role priority over the DB role (admin > DB student)', async () => {
    (verifyKeycloakToken as jest.Mock).mockResolvedValue({
      sub: SUB,
      email: 'ana@test.com',
      realmRoles: ['admin', 'student'],
      raw: {},
    });
    mockSubMaybeSingle.mockResolvedValue({ data: baseProfile, error: null });
    const req = makeReq();
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.role).toBe('admin');
  });

  it('falls back to the DB role when the token has no known realm role', async () => {
    (verifyKeycloakToken as jest.Mock).mockResolvedValue({
      sub: SUB,
      email: 'ana@test.com',
      realmRoles: ['offline_access', 'uma_authorization'],
      raw: {},
    });
    mockSubMaybeSingle.mockResolvedValue({ data: { ...baseProfile, role: 'instructor' }, error: null });
    const req = makeReq();
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(req.user?.role).toBe('instructor');
  });
});
