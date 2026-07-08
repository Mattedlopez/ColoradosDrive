import type { HelmetOptions } from 'helmet';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Configuración de seguridad perimetral (Sprint 2 · capas 1-3).
 *
 * Trazabilidad de riesgos (ver CONTEXT_Agente_Desarrollo.md §6):
 *  - R2  (cabeceras/cookies inseguras) -> set explícito de security headers + HSTS.
 *  - Capa 1 (transporte): HSTS fuerza HTTPS en el navegador tras la primera visita.
 *  - Capa 2 (navegador): CSP restrictiva + referrer-policy + no-sniff (vía Helmet).
 *
 * Criterio de proporcionalidad: se usan las funciones nativas de Helmet, sin
 * soluciones a medida. Al ser una API que solo devuelve JSON, la CSP puede ser
 * máximamente restrictiva (`default-src 'none'`) sin afectar respuestas.
 */
export const helmetOptions: HelmetOptions = {
  // Capa 1 — Transporte: HSTS 1 año, subdominios y preload.
  hsts: {
    maxAge: 31536000, // 365 días
    includeSubDomains: true,
    preload: true,
  },
  // Capa 2 — Navegador: CSP mínima para una API JSON (no sirve HTML/JS propio).
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  // No filtrar el origen completo en la cabecera Referer.
  referrerPolicy: { policy: 'no-referrer' },
  // La API es consumida por un frontend en otro origen (Vercel) vía CORS.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // X-Content-Type-Options: nosniff y X-Frame-Options: DENY van por defecto.
};

/**
 * Rate limiting (Sprint 2 · capa 3 · riesgo R3, DoD #2).
 *
 * Dos niveles, ambos configurables por variable de entorno:
 *  - `globalLimiter`: 60 req/min/IP en toda la API (valor del documento).
 *  - `authLimiter`: límite estricto en /api/auth para frenar fuerza bruta de login.
 *
 * Ambos responden `429` al excederse y exponen las cabeceras estándar
 * `RateLimit-*` (RFC draft-7) en vez de las heredadas `X-RateLimit-*`.
 */
const GLOBAL_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const GLOBAL_MAX = parseInt(process.env.RATE_LIMIT_MAX || '60', 10);
const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10);
const AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10);

export const globalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: GLOBAL_WINDOW_MS,
  max: GLOBAL_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Solo cuentan los intentos fallidos: un login correcto no penaliza al usuario.
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera un minuto.' },
});
