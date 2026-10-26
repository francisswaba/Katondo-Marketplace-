import type { Request, Response, NextFunction } from 'express';

export type UserRole =
  | 'buyer'
  | 'individual_seller'
  | 'business_seller'
  | 'platform_operator'
  | 'administrator'
  | 'super_administrator'
  | 'seller_reviewer'
  | 'customer_support'
  | 'finance_operator'
  | 'fulfilment_operator'
  | 'auditor'
  | 'service_agent';

export type ActorType = 'buyer' | 'seller' | 'staff' | 'ai_agent';

export type AuthenticatedPrincipal = {
  id: string;
  roles: UserRole[];
  permissions: string[];
  actorType: ActorType;
  clientId?: string;
  agentId?: string;
  platformUserId?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type AuthenticatedRequest = Request & { user?: AuthenticatedPrincipal };

export const allowedRoles: UserRole[] = [
  'buyer', 'individual_seller', 'business_seller', 'platform_operator', 'administrator',
  'super_administrator', 'seller_reviewer', 'customer_support', 'finance_operator',
  'fulfilment_operator', 'auditor', 'service_agent',
];

export const staffRoles: UserRole[] = [
  'platform_operator', 'administrator', 'super_administrator', 'seller_reviewer',
  'customer_support', 'finance_operator', 'fulfilment_operator', 'auditor',
];

export const agentPermissions = [
  'catalogue:read',
  'seller_applications:read',
  'seller_applications:triage',
] as const;

export function isStaff(principal: AuthenticatedPrincipal) {
  return principal.roles.some((role) => staffRoles.includes(role));
}

export function capabilitiesForRoles(roles: UserRole[]) {
  const has = (...required: UserRole[]) => required.some((role) => roles.includes(role));
  return {
    accessWorkspace: has(...staffRoles),
    viewSellerApplications: has('super_administrator', 'administrator', 'seller_reviewer', 'auditor'),
    reviewSellerApplications: has('super_administrator', 'administrator', 'seller_reviewer'),
    viewOperations: has('super_administrator', 'administrator', 'platform_operator', 'finance_operator', 'fulfilment_operator', 'auditor'),
    viewActivity: has('super_administrator', 'auditor'),
    manageActivity: has('super_administrator'),
    viewStaff: has('super_administrator', 'auditor'),
    manageStaff: has('super_administrator'),
    manageAgents: has('super_administrator'),
    viewReleaseControls: has('super_administrator', 'auditor'),
    manageReleaseControls: has('super_administrator'),
  };
}

export function requireAnyRole(roles: UserRole[]) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!request.user?.roles.some((role) => roles.includes(role))) {
      response.status(403).json({ error: 'Insufficient role.' });
      return;
    }
    next();
  };
}

export function requireAgentPermission(permission: typeof agentPermissions[number]) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (request.user?.actorType !== 'ai_agent' || !request.user.permissions.includes(permission)) {
      response.status(403).json({ error: 'Agent permission denied.' });
      return;
    }
    next();
  };
}
