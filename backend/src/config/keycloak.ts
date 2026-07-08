import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from './index';

/**
 * Validación local de access tokens de Keycloak (OIDC directo).
 *
 * La firma RS256 se verifica contra el JWKS del realm; `createRemoteJWKSet`
 * cachea las claves públicas en memoria (TTL 10 min + cooldown 30 s) para no
 * pedir el JWKS en cada petición ni martillar al IdP ante un `kid` desconocido.
 * Nunca se almacena un secreto simétrico.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Inicializa (perezosamente) el set remoto de claves públicas del realm. */
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!config.keycloak.url) {
    throw new Error('KEYCLOAK_URL no configurado: no se pueden validar tokens.');
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.keycloak.jwksUrl), {
      cacheMaxAge: 10 * 60 * 1000, // 10 min de caché de claves
      cooldownDuration: 30 * 1000, // 30 s entre refrescos ante kid desconocido
    });
  }
  return jwks;
}

export interface KeycloakClaims {
  sub: string;
  email: string | null;
  /** Roles de realm (`realm_access.roles`): admin / instructor / student / … */
  realmRoles: string[];
  raw: JWTPayload;
}

/**
 * Verifica firma RS256 + `exp` + `iss` + `aud` (colorados-api) y devuelve los
 * claims relevantes. Lanza si el token es inválido o expiró (el caller responde 401).
 */
export async function verifyKeycloakToken(token: string): Promise<KeycloakClaims> {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: config.keycloak.issuer,
    audience: config.keycloak.audience,
  });

  const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
  const realmRoles = Array.isArray(realmAccess?.roles)
    ? (realmAccess.roles as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];

  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : null,
    realmRoles,
    raw: payload,
  };
}
