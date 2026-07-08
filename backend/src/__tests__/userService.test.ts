/**
 * Unit tests for userService — deleteUser (Keycloak edition).
 *
 * Strategy: mock the Supabase repository (IUserRepository), supabaseAdmin
 * (DB reads) and keycloakAdminService (identity) so tests run without a real
 * DB or Keycloak connection.
 */

import { deleteUser } from '../services/userService';
import { userRepository } from '../repositories/SupabaseUserRepository';
import { IUserRepository } from '../repositories/interfaces/IUserRepository';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Replace the repository singleton used by userService
jest.mock('../repositories/SupabaseUserRepository', () => ({
  userRepository: {
    findById: jest.fn(),
    findScheduleId: jest.fn(),
    findByScheduleId: jest.fn(),
    insertProfile: jest.fn(),
    updateProfile: jest.fn(),
    deleteProfile: jest.fn(),
    deleteScheduleOverrides: jest.fn(),
  },
}));

const mockRepository = userRepository as jest.Mocked<IUserRepository>;

// Mock keycloakAdminService (identity lives in Keycloak now)
jest.mock('../services/keycloakAdminService', () => ({
  createKeycloakUser: jest.fn(),
  deleteKeycloakUser: jest.fn(),
  resetKeycloakPassword: jest.fn(),
  updateKeycloakUserName: jest.fn(),
  findKeycloakUserByEmail: jest.fn(),
}));

// Mock supabaseAdmin (DB only)
const mockMaybeSingle = jest.fn();
jest.mock('../config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn().mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: mockMaybeSingle,
      limit: jest.fn().mockReturnThis(),
    })),
  },
}));

import { deleteKeycloakUser } from '../services/keycloakAdminService';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  const USER_ID = 'test-user-uuid-1234';
  const KEYCLOAK_SUB = 'keycloak-sub-uuid-9999';

  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { keycloak_sub: KEYCLOAK_SUB }, error: null });
  });

  it('deletes schedule overrides, profile, then the Keycloak user (by keycloak_sub)', async () => {
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({});
    (deleteKeycloakUser as jest.Mock).mockResolvedValue({});

    const result = await deleteUser(USER_ID);

    expect(result.error).toBeUndefined();
    expect(mockRepository.deleteScheduleOverrides).toHaveBeenCalledWith(USER_ID);
    expect(mockRepository.deleteProfile).toHaveBeenCalledWith(USER_ID);
    expect(deleteKeycloakUser).toHaveBeenCalledWith(KEYCLOAK_SUB);
  });

  it('falls back to the profile PK when keycloak_sub is missing (new users: PK = sub)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { keycloak_sub: null }, error: null });
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({});
    (deleteKeycloakUser as jest.Mock).mockResolvedValue({});

    const result = await deleteUser(USER_ID);

    expect(result.error).toBeUndefined();
    expect(deleteKeycloakUser).toHaveBeenCalledWith(USER_ID);
  });

  it('returns error and skips Keycloak deletion when profile delete fails', async () => {
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({ error: 'DB constraint violation' });

    const result = await deleteUser(USER_ID);

    expect(result.error).toBe('DB constraint violation');
    expect(deleteKeycloakUser).not.toHaveBeenCalled();
  });

  it('returns error when Keycloak deletion fails', async () => {
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({});
    (deleteKeycloakUser as jest.Mock).mockResolvedValue({ error: 'Keycloak Admin API devolvió 500' });

    const result = await deleteUser(USER_ID);

    expect(result.error).toBe('Keycloak Admin API devolvió 500');
  });
});

// ─── Middleware tests (no DB) ─────────────────────────────────────────────────

import { handleValidation } from '../middleware/validate';
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

describe('handleValidation middleware', () => {
  const mockReq = {} as Request;
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const mockNext = jest.fn() as NextFunction;

  beforeEach(() => jest.clearAllMocks());

  it('calls next() when there are no validation errors', () => {
    (validationResult as unknown as jest.Mock).mockReturnValue({ isEmpty: () => true });
    handleValidation(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('responds 400 with the first error message when validation fails', () => {
    (validationResult as unknown as jest.Mock).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'Correo electrónico no válido' }],
    });
    handleValidation(mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Correo electrónico no válido' }),
    );
  });
});
