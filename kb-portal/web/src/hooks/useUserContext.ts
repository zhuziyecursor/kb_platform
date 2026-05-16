/**
 * User Context Hook
 *
 * Provides tenant and user information from session storage.
 * In production, this should be replaced with proper authentication context
 * that parses OBO token JWT claims.
 */

import { useState, useEffect } from 'react';

interface UserContext {
  tenantId: string;
  userId: string;
  username: string;
  roleLabel: string;
}

const DEFAULT_TENANT_ID = 'dev-tenant-001';
const DEFAULT_USER_ID = 'dev-user-001';

export function useUserContext(): UserContext {
  const [context, setContext] = useState<UserContext>({
    tenantId: DEFAULT_TENANT_ID,
    userId: DEFAULT_USER_ID,
    username: 'admin',
    roleLabel: '管理员',
  });

  useEffect(() => {
    // TODO: In production, parse from OBO token JWT claims
    // const oboToken = sessionStorage.getItem('obo_token');
    // const claims = parseJWT(oboToken);
    // setContext({
    //   tenantId: claims.tenant_id,
    //   userId: claims.sub,
    //   username: claims.name,
    //   roleLabel: claims.role_label,
    // });

    // For now, read from session storage (set by login page)
    const tenantId = sessionStorage.getItem('tenantId') || DEFAULT_TENANT_ID;
    const userId = sessionStorage.getItem('userId') || DEFAULT_USER_ID;
    const username = sessionStorage.getItem('username') || 'admin';
    const roleLabel = sessionStorage.getItem('roleLabel') || '管理员';

    setContext({ tenantId, userId, username, roleLabel });
  }, []);

  return context;
}

/**
 * Get tenant ID synchronously (for use outside React components)
 */
export function getTenantId(): string {
  return sessionStorage.getItem('tenantId') || DEFAULT_TENANT_ID;
}

/**
 * Get user ID synchronously (for use outside React components)
 */
export function getUserId(): string {
  return sessionStorage.getItem('userId') || DEFAULT_USER_ID;
}
