export type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'SUPERVISOR' | 'AGENT' | 'ANALYST' | 'READ_ONLY';

export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 100,
  TENANT_ADMIN: 80,
  SUPERVISOR: 60,
  AGENT: 40,
  ANALYST: 30,
  READ_ONLY: 10,
};
