import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { verifyKeycloakToken, KeycloakClaims } from '../config/keycloak';
import { AuthUser, AuthenticatedRequest, UserRole } from '../types';

/** Prioridad de roles de realm cuando el token trae más de uno. */
const ROLE_PRIORITY: readonly UserRole[] = ['admin', 'instructor', 'student'];

/** Proyección del perfil local (misma que el middleware histórico + keycloak_sub). */
const PROFILE_SELECT =
  'id, email, full_name, role, course_id, cohort_id, instructor_id, keycloak_sub, cohorts(course_id)';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  course_id: string | null;
  cohort_id: string | null;
  instructor_id: string | null;
  keycloak_sub: string | null;
  cohorts: { course_id?: string } | null;
}

/** Deriva el UserRole a partir de los roles de realm del token (admin > instructor > student). */
function roleFromRealm(realmRoles: string[]): UserRole | null {
  for (const role of ROLE_PRIORITY) {
    if (realmRoles.includes(role)) return role;
  }
  return null;
}

/**
 * Resuelve el perfil local a partir de los claims de Keycloak:
 *  1. Lookup por `keycloak_sub` (camino rápido, indexado).
 *  2. Fallback por email (case-insensitive) con self-heal: persiste el `sub`
 *     para que las siguientes peticiones entren por el camino 1.
 */
async function findProfileForClaims(claims: KeycloakClaims): Promise<ProfileRow | null> {
  const bySub = await supabaseAdmin
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('keycloak_sub', claims.sub)
    .maybeSingle();

  if (bySub.data) return bySub.data as unknown as ProfileRow;

  if (!claims.email) return null;

  const byEmail = await supabaseAdmin
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .ilike('email', claims.email)
    .maybeSingle();

  if (!byEmail.data) return null;
  const profile = byEmail.data as unknown as ProfileRow;

  // Self-heal: persistir el sub de Keycloak en el perfil (best-effort).
  await supabaseAdmin
    .from('user_profiles')
    .update({ keycloak_sub: claims.sub })
    .eq('id', profile.id);

  return profile;
}

/** Arma el AuthUser. CRÍTICO: `id` es el PK del perfil (≈80 call sites dependen de esto). */
function buildAuthUser(profile: ProfileRow, claims: KeycloakClaims): AuthUser {
  const courseId = profile.course_id ?? profile.cohorts?.course_id ?? null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || '',
    // RBAC federado: el rol de realm de Keycloak manda; el de BD es respaldo.
    role: (roleFromRealm(claims.realmRoles) ?? profile.role) as UserRole,
    courseId,
    cohortId: profile.cohort_id ?? null,
    instructorId: profile.instructor_id ?? null,
  };
}

/**
 * Verifica el access token de Keycloak (firma RS256 + iss + aud contra el JWKS
 * del realm) y popula req.user con el perfil local.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  let claims: KeycloakClaims;
  try {
    claims = await verifyKeycloakToken(token);
  } catch (e) {
    const expired = e instanceof Error && e.name === 'JWTExpired';
    res.status(401).json({
      error: expired
        ? 'Sesión expirada. Cierra sesión e inicia de nuevo.'
        : 'Token inválido. Cierra sesión e inicia de nuevo.',
    });
    return;
  }

  try {
    const profile = await findProfileForClaims(claims);
    if (!profile) {
      res.status(401).json({ error: 'Perfil de usuario no encontrado. Contacta al administrador.' });
      return;
    }
    req.user = buildAuthUser(profile, claims);
    next();
  } catch {
    res.status(401).json({ error: 'Error de autenticación. Cierra sesión e inicia de nuevo.' });
  }
}
