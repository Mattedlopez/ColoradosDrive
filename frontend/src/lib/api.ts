import { getApiUrl } from '@/lib/env';

const API_URL = getApiUrl();

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'student' | 'instructor';
  courseId: string | null;
  instructorId?: string | null;
}

/**
 * Resuelve el perfil local a partir del access token de Keycloak.
 * El backend valida el JWT (issuer + audience) y busca el perfil en BD.
 */
export async function getMe(token: string): Promise<User> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error('Session expired');
  return res.json();
}

export function getAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function onSessionExpired(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener('colorados_session_expired', handler);
  return () => window.removeEventListener('colorados_session_expired', handler);
}

export function triggerSessionExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('colorados_session_expired'));
  }
}
