import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { getKeycloakClientId, getKeycloakRealm, getKeycloakUrl } from '@/lib/env';

/**
 * Singleton perezoso del UserManager de oidc-client-ts (OIDC directo contra
 * Keycloak, Authorization Code + PKCE — el flujo lo activa response_type 'code').
 *
 * Solo puede usarse en el navegador: depende de window.location y localStorage.
 */

let userManager: UserManager | null = null;

export function getUserManager(): UserManager {
  if (typeof window === 'undefined') {
    throw new Error('getUserManager() solo puede llamarse en el navegador (client-side).');
  }
  if (!userManager) {
    const origin = window.location.origin;
    userManager = new UserManager({
      authority: `${getKeycloakUrl()}/realms/${getKeycloakRealm()}`,
      client_id: getKeycloakClientId(),
      redirect_uri: `${origin}/auth/callback`,
      post_logout_redirect_uri: `${origin}/login`,
      silent_redirect_uri: `${origin}/auth/silent`,
      response_type: 'code',
      scope: 'openid profile email',
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      automaticSilentRenew: true,
      monitorSession: false,
    });
  }
  return userManager;
}
