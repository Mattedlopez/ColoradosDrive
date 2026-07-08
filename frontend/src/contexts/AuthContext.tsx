'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/api';
import { getMe, onSessionExpired } from '@/lib/api';
import { getUserManager } from '@/lib/oidc';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** Redirige a Keycloak (OIDC Authorization Code + PKCE). */
  login: () => Promise<void>;
  /** Hidrata la sesión a partir de un access token ya emitido (callback OIDC). */
  loginWithToken: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Al montar: restaura la sesión OIDC persistida (localStorage) y resuelve el
  // perfil local contra el backend (GET /api/auth/me valida el token Keycloak).
  useEffect(() => {
    let cancelled = false;
    const manager = getUserManager();

    manager
      .getUser()
      .then(async (oidcUser) => {
        if (!oidcUser || oidcUser.expired || !oidcUser.access_token) return;
        try {
          const me = await getMe(oidcUser.access_token);
          if (cancelled) return;
          setUser(me);
          setToken(oidcUser.access_token);
        } catch {
          // Token inválido para el backend (401) → descarta la sesión local.
          await manager.removeUser().catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Silent renew: cuando oidc-client-ts renueva el token, actualízalo aquí.
    const onUserLoaded = (renewed: { access_token: string }) => {
      if (renewed.access_token) setToken(renewed.access_token);
    };
    // Token expirado sin renovación posible → cierre de sesión local.
    const onExpired = () => {
      void manager.removeUser().catch(() => {});
      setToken(null);
      setUser(null);
      router.replace('/login');
    };
    manager.events.addUserLoaded(onUserLoaded);
    manager.events.addAccessTokenExpired(onExpired);

    return () => {
      cancelled = true;
      manager.events.removeUserLoaded(onUserLoaded);
      manager.events.removeAccessTokenExpired(onExpired);
    };
  }, [router]);

  // 401 detectados por lib/api → limpiar sesión y volver al login.
  useEffect(() => {
    const clearSession = () => {
      getUserManager()
        .removeUser()
        .catch(() => {});
      setToken(null);
      setUser(null);
      router.replace('/login');
    };
    return onSessionExpired(clearSession);
  }, [router]);

  const login = async () => {
    await getUserManager().signinRedirect();
  };

  const loginWithToken = async (accessToken: string) => {
    // El backend valida el JWT de Keycloak y resuelve el rol desde user_profiles.
    const me = await getMe(accessToken);
    setToken(accessToken);
    setUser(me);
    const dest = me.role === 'admin' ? '/admin' : me.role === 'instructor' ? '/instructor' : '/student';
    router.push(dest);
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    try {
      // end_session de Keycloak → Single Logout (cierra la cookie SSO del IdP).
      await getUserManager().signoutRedirect();
    } catch {
      // Fallback: si el IdP no responde, al menos limpia la sesión local.
      await getUserManager()
        .removeUser()
        .catch(() => {});
      router.replace('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
