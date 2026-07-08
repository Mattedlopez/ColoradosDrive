'use client';

import { useEffect, useRef } from 'react';
import { getUserManager } from '@/lib/oidc';

/**
 * Página mínima para el silent renew de oidc-client-ts: se carga en un iframe
 * oculto y devuelve el nuevo token al UserManager de la ventana principal.
 */
export default function AuthSilentPage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void getUserManager()
      .signinSilentCallback()
      .catch(() => {});
  }, []);

  return null;
}
