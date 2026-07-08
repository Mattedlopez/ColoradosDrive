const LOCAL_API_FALLBACK = 'http://localhost:3001';

function normalizeApiUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Resuelve la URL base del backend.
 * - En desarrollo permite fallback local.
 * - En producción usa el valor configurado; si falta, mantiene fallback para no romper build.
 *   La validacion estricta se hace antes de llamadas criticas (ej. login).
 */
export function getApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) return normalizeApiUrl(raw);
  return LOCAL_API_FALLBACK;
}

export function isApiUrlConfiguredForProduction(apiUrl: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return !/localhost|127\.0\.0\.1/i.test(apiUrl);
}

// ─── Keycloak (OIDC directo — control de identidades central) ─────────────────

const KEYCLOAK_URL_FALLBACK = 'https://keycloak-production-43dc.up.railway.app';
const KEYCLOAK_REALM_FALLBACK = 'udla8';
const KEYCLOAK_CLIENT_ID_FALLBACK = 'colorados-web';

/** URL base del servidor Keycloak (sin `/realms/...`, sin slash final). */
export function getKeycloakUrl(): string {
  const raw = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim();
  if (raw) return normalizeApiUrl(raw);
  return KEYCLOAK_URL_FALLBACK;
}

/** Realm de Keycloak donde viven los usuarios. */
export function getKeycloakRealm(): string {
  const raw = process.env.NEXT_PUBLIC_KEYCLOAK_REALM?.trim();
  if (raw) return raw;
  return KEYCLOAK_REALM_FALLBACK;
}

/** Client OIDC público (PKCE) de este frontend. */
export function getKeycloakClientId(): string {
  const raw = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID?.trim();
  if (raw) return raw;
  return KEYCLOAK_CLIENT_ID_FALLBACK;
}
