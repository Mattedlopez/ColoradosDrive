/**
 * keycloakTokenService — token de servicio (client_credentials).
 *
 * Obtiene y cachea el access token del client confidencial `colorados-service`.
 * El token se reutiliza hasta 30 s antes de su expiración (margen de seguridad
 * para evitar usar un token que expire en vuelo).
 */

import { config } from '../config';

interface CachedToken {
  token: string;
  /** Epoch ms en el que el token expira. */
  expiresAt: number;
}

const SAFETY_MARGIN_MS = 30_000;

let cached: CachedToken | null = null;

/** Limpia la caché (para tests). */
export function clearServiceTokenCache(): void {
  cached = null;
}

/** Devuelve un access token válido del service account (cacheado). */
export async function getServiceToken(): Promise<string> {
  const now = Date.now();
  if (cached && now < cached.expiresAt - SAFETY_MARGIN_MS) {
    return cached.token;
  }

  if (!config.keycloak.url) {
    throw new Error('KEYCLOAK_URL no configurado: no se puede obtener el token de servicio.');
  }
  if (!config.keycloak.serviceClientSecret) {
    throw new Error(
      'KEYCLOAK_SERVICE_CLIENT_SECRET no configurado: no se puede obtener el token de servicio.',
    );
  }

  const res = await fetch(config.keycloak.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.keycloak.serviceClientId,
      client_secret: config.keycloak.serviceClientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Keycloak client_credentials falló (${res.status}): ${body || res.statusText}`,
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Keycloak no devolvió access_token en client_credentials.');
  }

  cached = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 60) * 1000,
  };
  return cached.token;
}
