/**
 * keycloakAdminService — gestión de usuarios contra la Admin API de Keycloak.
 *
 * Reemplaza a supabaseAdmin.auth.admin.* (GoTrue deja de recibir escrituras).
 * Todas las llamadas usan el token del service account `colorados-service`.
 *
 * REQUISITO: el service account de `colorados-service` necesita los roles de
 * client `realm-management`: `manage-users` y `view-users`. Si faltan, la
 * Admin API responde 403 en runtime (ver scripts/keycloak-setup.sh).
 */

import { config } from '../config';
import { getServiceToken } from './keycloakTokenService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateKeycloakUserParams {
  email: string;
  fullName: string;
  password: string;
  role: 'admin' | 'instructor' | 'student';
  /** Si true, Keycloak obliga a cambiar la contraseña en el primer login. */
  temporaryPassword?: boolean;
}

export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

interface RoleRepresentation {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERMISSIONS_HINT =
  'Verifica que el service account de colorados-service tenga los roles de ' +
  'realm-management "manage-users" y "view-users" (ver scripts/keycloak-setup.sh).';

/** Llama a la Admin API con el token de servicio. Lanza en 403 (permisos). */
async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getServiceToken();
  const res = await fetch(`${config.keycloak.adminApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 403) {
    throw new Error(`Keycloak Admin API devolvió 403 (permisos insuficientes). ${PERMISSIONS_HINT}`);
  }
  return res;
}

/** Extrae el mensaje de error del body de la Admin API. */
async function readAdminError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    errorMessage?: string;
    error?: string;
    error_description?: string;
  };
  return body.errorMessage || body.error_description || body.error || `HTTP ${res.status}`;
}

/** Divide un nombre completo en firstName / lastName para Keycloak. */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: fullName.trim(), lastName: '' };
  const mid = Math.ceil(parts.length / 2);
  return { firstName: parts.slice(0, mid).join(' '), lastName: parts.slice(mid).join(' ') };
}

/** Caché de representaciones de roles de realm (id + name). */
const roleCache = new Map<string, RoleRepresentation>();

async function getRealmRole(roleName: string): Promise<RoleRepresentation> {
  const cachedRole = roleCache.get(roleName);
  if (cachedRole) return cachedRole;

  const res = await adminFetch(`/roles/${encodeURIComponent(roleName)}`);
  if (!res.ok) {
    throw new Error(`No se pudo obtener el rol de realm "${roleName}": ${await readAdminError(res)}`);
  }
  const role = (await res.json()) as RoleRepresentation;
  roleCache.set(roleName, { id: role.id, name: role.name });
  return role;
}

// ─── createKeycloakUser ──────────────────────────────────────────────────────

/**
 * Crea el usuario en Keycloak, le fija la contraseña y le asigna el rol de realm.
 * El id devuelto (UUID de Keycloak) se usa como PK del perfil local.
 */
export async function createKeycloakUser(
  params: CreateKeycloakUserParams,
): Promise<{ userId: string; error?: string }> {
  try {
    const { firstName, lastName } = splitFullName(params.fullName);

    const createRes = await adminFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: params.email,
        email: params.email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: true,
        credentials: [
          {
            type: 'password',
            value: params.password,
            temporary: params.temporaryPassword ?? false,
          },
        ],
      }),
    });

    if (createRes.status === 409) {
      return { userId: '', error: 'Ya existe un usuario con ese correo en Keycloak' };
    }
    if (!createRes.ok) {
      return { userId: '', error: await readAdminError(createRes) };
    }

    // El id viene en el header Location: .../users/{id}
    const location = createRes.headers.get('location') || '';
    const userId = location.split('/').filter(Boolean).pop() || '';
    if (!userId) {
      return { userId: '', error: 'Keycloak no devolvió el id del usuario creado (header Location)' };
    }

    // Asignar el rol de realm (admin / instructor / student).
    const role = await getRealmRole(params.role);
    const roleRes = await adminFetch(`/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([role]),
    });
    if (!roleRes.ok) {
      // Rollback: no dejar usuarios sin rol.
      await deleteKeycloakUser(userId);
      return {
        userId: '',
        error: `No se pudo asignar el rol "${params.role}": ${await readAdminError(roleRes)}`,
      };
    }

    return { userId };
  } catch (e) {
    return { userId: '', error: e instanceof Error ? e.message : 'Error al crear usuario en Keycloak' };
  }
}

// ─── deleteKeycloakUser ──────────────────────────────────────────────────────

/** Elimina el usuario en Keycloak. Tolera 404 (ya no existe). */
export async function deleteKeycloakUser(userId: string): Promise<{ error?: string }> {
  try {
    const res = await adminFetch(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      return { error: await readAdminError(res) };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al eliminar usuario en Keycloak' };
  }
}

// ─── resetKeycloakPassword ───────────────────────────────────────────────────

/** Fija una nueva contraseña para el usuario. */
export async function resetKeycloakPassword(
  userId: string,
  newPassword: string,
  temporary: boolean = false,
): Promise<{ error?: string }> {
  try {
    const res = await adminFetch(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: newPassword, temporary }),
    });
    if (!res.ok) {
      return { error: await readAdminError(res) };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al actualizar la contraseña en Keycloak' };
  }
}

// ─── updateKeycloakUserName ──────────────────────────────────────────────────

/** Actualiza el nombre (firstName/lastName) del usuario en Keycloak. */
export async function updateKeycloakUserName(
  userId: string,
  fullName: string,
): Promise<{ error?: string }> {
  try {
    const { firstName, lastName } = splitFullName(fullName);
    const res = await adminFetch(`/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ firstName, lastName }),
    });
    if (!res.ok) {
      return { error: await readAdminError(res) };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error al actualizar el nombre en Keycloak' };
  }
}

// ─── findKeycloakUserByEmail ─────────────────────────────────────────────────

/** Busca un usuario por email exacto. Devuelve null si no existe. */
export async function findKeycloakUserByEmail(email: string): Promise<KeycloakUser | null> {
  const res = await adminFetch(`/users?email=${encodeURIComponent(email)}&exact=true`);
  if (!res.ok) {
    throw new Error(`No se pudo buscar el usuario por email: ${await readAdminError(res)}`);
  }
  const users = (await res.json()) as KeycloakUser[];
  if (!Array.isArray(users) || users.length === 0) return null;
  const lower = email.toLowerCase();
  return users.find((u) => u.email?.toLowerCase() === lower) ?? users[0];
}
