import dotenv from 'dotenv';

dotenv.config();

/** Escapa caracteres especiales de regex en un literal */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Convierte un patrón tipo "https://*.vercel.app" en RegExp (* = cualquier host). */
function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split('*').map(escapeRegexLiteral);
  const regexStr = parts.join('[^/]+');
  return new RegExp(`^${regexStr}$`);
}

const CORS_EXACT_ORIGINS = new Set<string>();
const CORS_PATTERNS: RegExp[] = [];

const corsOriginEnv = (process.env.CORS_ORIGIN || '').trim();
if (corsOriginEnv) {
  for (const entry of corsOriginEnv.split(',')) {
    const value = entry.trim();
    if (!value) continue;
    if (value.includes('*')) {
      CORS_PATTERNS.push(patternToRegex(value));
    } else {
      CORS_EXACT_ORIGINS.add(value);
    }
  }
}

const DEV_DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:3003',
  'http://127.0.0.1:3003',
];

/**
 * Indica si un origen está permitido por CORS. Nunca se usa '*'.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin || typeof origin !== 'string') return false;
  const isDev = process.env.NODE_ENV !== 'production';
  const hasConfig = CORS_EXACT_ORIGINS.size > 0 || CORS_PATTERNS.length > 0;
  if (isDev && !hasConfig) {
    if (DEV_DEFAULT_ORIGINS.includes(origin)) return true;
    // En desarrollo permitir cualquier puerto de localhost
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    return false;
  }
  if (CORS_EXACT_ORIGINS.has(origin)) return true;
  return CORS_PATTERNS.some((re) => re.test(origin));
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Supabase queda SOLO como base de datos (la identidad vive en Keycloak). */
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },
  /**
   * Keycloak — control de identidades central (OIDC directo).
   * El backend valida los access tokens contra el JWKS del realm y usa el
   * client confidencial `colorados-service` (client_credentials) para la
   * Admin API y para la trama A→B hacia CampusRide.
   */
  keycloak: {
    url: (process.env.KEYCLOAK_URL || '').replace(/\/$/, ''),
    realm: process.env.KEYCLOAK_REALM || 'udla8',
    /** Audience esperado en los tokens de usuario (mapper custom del realm). */
    audience: process.env.KEYCLOAK_AUDIENCE || 'colorados-api',
    serviceClientId: process.env.KEYCLOAK_SERVICE_CLIENT_ID || 'colorados-service',
    serviceClientSecret: process.env.KEYCLOAK_SERVICE_CLIENT_SECRET || '',
    /** Issuer esperado en los tokens (`iss`). */
    get issuer(): string {
      return `${this.url}/realms/${this.realm}`;
    },
    /** Endpoint JWKS del realm (claves públicas RS256). */
    get jwksUrl(): string {
      return `${this.issuer}/protocol/openid-connect/certs`;
    },
    /** Token endpoint (client_credentials del service account). */
    get tokenUrl(): string {
      return `${this.issuer}/protocol/openid-connect/token`;
    },
    /** Base de la Admin API del realm (gestión de usuarios). */
    get adminApiUrl(): string {
      return `${this.url}/admin/realms/${this.realm}`;
    },
  },
  /** Vault Transit (KMS) — cifrado de la trama A→B. */
  vault: {
    addr: (process.env.VAULT_ADDR || '').replace(/\/$/, ''),
    token: process.env.VAULT_TOKEN || '',
    transitKey: process.env.VAULT_TRANSIT_KEY || 'certifications-key',
  },
  /** Sistema B (CampusRide) — receptor de certificaciones cifradas. */
  campusride: {
    apiUrl: (process.env.CAMPUSRIDE_API_URL || '').replace(/\/$/, ''),
  },
};
