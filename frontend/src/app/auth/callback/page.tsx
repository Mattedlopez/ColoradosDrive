'use client';

import { useEffect, useRef, useState } from 'react';
import { getUserManager } from '@/lib/oidc';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Callback del login OIDC. Keycloak redirige aquí con el `code` (PKCE);
 * oidc-client-ts lo canjea en signinCallback() y con el access token
 * resolvemos el perfil local (GET /api/auth/me) antes de entrar por rol.
 */
export default function AuthCallbackPage() {
  const { loginWithToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Evita el doble canje del code en el doble-mount de React Strict Mode.
    if (started.current) return;
    started.current = true;

    const run = async () => {
      const manager = getUserManager();
      let accessToken: string;
      try {
        const oidcUser = await manager.signinCallback();
        if (!oidcUser?.access_token) {
          throw new Error('No se recibió el token de Keycloak.');
        }
        accessToken = oidcUser.access_token;
      } catch (e) {
        setError(
          e instanceof Error && e.message !== 'No matching state found in storage'
            ? e.message
            : 'No se pudo completar el inicio de sesión. Vuelve a intentarlo desde el login.',
        );
        return;
      }

      try {
        // Hidrata el contexto y redirige según el rol (admin/instructor/student).
        await loginWithToken(accessToken);
      } catch {
        // Autenticó en Keycloak pero no tiene perfil en Colorados Drive:
        // descarta la sesión local y ofrece cerrar la sesión SSO del IdP.
        await manager.removeUser().catch(() => {});
        setNotRegistered(true);
        setError('Tu cuenta no está registrada en Colorados Drive. Contacta al administrador.');
      }
    };

    void run();
  }, [loginWithToken]);

  const handleSignout = () => {
    void getUserManager()
      .signoutRedirect()
      .catch(() => {
        window.location.replace('/login');
      });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      {error ? (
        <div className="max-w-sm text-center space-y-5 px-6">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <p className="text-neutral-300 text-sm">{error}</p>
          </div>
          {notRegistered ? (
            <button
              onClick={handleSignout}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 transition-colors"
            >
              Cerrar sesión
            </button>
          ) : (
            <button
              onClick={() => window.location.replace('/login')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 transition-colors"
            >
              Volver al inicio de sesión
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="w-12 h-12 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm font-medium">Completando inicio de sesión…</p>
        </div>
      )}
    </div>
  );
}
