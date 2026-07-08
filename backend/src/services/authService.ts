/**
 * authService — cuentas de acceso vía Keycloak.
 *
 * Responsabilidad única: todo lo que toca cuentas de identidad (Keycloak
 * Admin API). El login ya NO pasa por aquí: el frontend hace OIDC directo
 * contra Keycloak (PKCE) y el backend solo valida tokens en el middleware.
 * El CRUD de perfiles vive en userService.
 */

import { supabaseAdmin } from '../config/supabase';
import {
  createKeycloakUser,
  deleteKeycloakUser,
  resetKeycloakPassword,
  findKeycloakUserByEmail,
} from './keycloakAdminService';

// ─── createInstructorWithLogin ───────────────────────────────────────────────

export async function createInstructorWithLogin(params: {
  instructorId: string;
  email: string;
  password: string;
  fullName: string;
}): Promise<{ userId: string; error?: string }> {
  const created = await createKeycloakUser({
    email: params.email,
    fullName: params.fullName,
    password: params.password,
    role: 'instructor',
  });

  if (created.error || !created.userId) {
    return { userId: '', error: created.error || 'Error al crear usuario' };
  }

  // PK del perfil = UUID de Keycloak (y keycloak_sub para el lookup del middleware).
  const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
    id: created.userId,
    keycloak_sub: created.userId,
    email: params.email,
    full_name: params.fullName,
    role: 'instructor',
    instructor_id: params.instructorId,
  });

  if (profileError) {
    await deleteKeycloakUser(created.userId);
    return { userId: '', error: profileError.message };
  }

  return { userId: created.userId };
}

// ─── updateInstructorPassword ────────────────────────────────────────────────

export async function updateInstructorPassword(
  instructorId: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, keycloak_sub')
    .eq('instructor_id', instructorId)
    .eq('role', 'instructor')
    .maybeSingle();

  if (!profile) return { error: 'No existe cuenta de acceso para este instructor' };

  const row = profile as { id: string; email: string; keycloak_sub: string | null };

  // Resolver el id de Keycloak: keycloak_sub o búsqueda por email (con self-heal).
  let keycloakId = row.keycloak_sub;
  if (!keycloakId) {
    try {
      const found = await findKeycloakUserByEmail(row.email);
      keycloakId = found?.id ?? null;
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al buscar el usuario en Keycloak' };
    }
    if (!keycloakId) {
      return { error: 'El instructor no tiene cuenta en Keycloak (federar primero)' };
    }
    await supabaseAdmin
      .from('user_profiles')
      .update({ keycloak_sub: keycloakId })
      .eq('id', row.id);
  }

  const { error } = await resetKeycloakPassword(keycloakId, newPassword);
  if (error) return { error };
  return {};
}
