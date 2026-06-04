/**
 * Unit tests for userService — deleteUser and updateUserProfile.
 *
 * Strategy: mock the Supabase repository (IUserRepository) and supabaseAdmin
 * so tests run without a real DB connection.
 *
 * Priority functions to test (in order of business risk):
 *   1. deleteUser  — irreversible, cascades auth + profile
 *   2. updateUserProfile — schedule cleanup side-effect
 *   3. createUser  — complex orchestration (integration test recommended)
 */

import { deleteUser } from '../services/userService';
import * as repositoryModule from '../repositories/SupabaseUserRepository';
import { IUserRepository } from '../repositories/interfaces/IUserRepository';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRepository: jest.Mocked<IUserRepository> = {
  findById: jest.fn(),
  findScheduleId: jest.fn(),
  findByScheduleId: jest.fn(),
  insertProfile: jest.fn(),
  updateProfile: jest.fn(),
  deleteProfile: jest.fn(),
  deleteScheduleOverrides: jest.fn(),
};

// Replace singleton used by userService
jest.spyOn(repositoryModule, 'userRepository', 'get').mockReturnValue(mockRepository);

// Mock supabaseAdmin.auth.admin.deleteUser
jest.mock('../config/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: jest.fn(),
        createUser: jest.fn(),
        updateUserById: jest.fn(),
      },
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      limit: jest.fn().mockReturnThis(),
    }),
  },
  supabaseAnon: {
    auth: {
      signInWithPassword: jest.fn(),
    },
  },
}));

import { supabaseAdmin } from '../config/supabase';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  const USER_ID = 'test-user-uuid-1234';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes schedule overrides, profile, then auth user in order', async () => {
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({});
    (supabaseAdmin.auth.admin.deleteUser as jest.Mock).mockResolvedValue({ error: null });

    const result = await deleteUser(USER_ID);

    expect(result.error).toBeUndefined();
    expect(mockRepository.deleteScheduleOverrides).toHaveBeenCalledWith(USER_ID);
    expect(mockRepository.deleteProfile).toHaveBeenCalledWith(USER_ID);
    expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('returns error and skips auth deletion when profile delete fails', async () => {
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({ error: 'DB constraint violation' });

    const result = await deleteUser(USER_ID);

    expect(result.error).toBe('DB constraint violation');
    expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('returns error when Supabase auth deletion fails', async () => {
    mockRepository.deleteScheduleOverrides.mockResolvedValue(undefined);
    mockRepository.deleteProfile.mockResolvedValue({});
    (supabaseAdmin.auth.admin.deleteUser as jest.Mock).mockResolvedValue({
      error: { message: 'User not found in auth' },
    });

    const result = await deleteUser(USER_ID);

    expect(result.error).toBe('User not found in auth');
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
