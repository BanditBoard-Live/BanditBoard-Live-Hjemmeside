export const USER_ROLES = [
  "gaest",
  "bruger",
  "scoreboard_admin",
  "administrer_scoreboard",
  "administrer_indstillinger",
  "admin",
  "administrator_manager",
  "udlejning",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  gaest: "Gæst",
  bruger: "Bruger",
  scoreboard_admin: "Scoreboard-admin",
  administrer_scoreboard: "Administrer scoreboard",
  administrer_indstillinger: "Administrer indstillinger",
  admin: "Admin",
  administrator_manager: "Administrator-manager",
  udlejning: "Udlejning",
};

export function normalizeRole(role: string): UserRole {
  if (role === "klub") return "bruger";
  if ((USER_ROLES as readonly string[]).includes(role)) return role as UserRole;
  return "gaest";
}

export function canAssignRoles(role: UserRole): boolean {
  return role === "admin" || role === "administrator_manager";
}

export function canManageVenues(role: UserRole): boolean {
  return canAssignRoles(role) || role === "udlejning";
}

export function canEditSiteSettings(role: UserRole): boolean {
  return canAssignRoles(role) || role === "administrer_indstillinger";
}

export function canUseScoreboard(role: UserRole): boolean {
  return (
    role === "bruger" ||
    role === "scoreboard_admin" ||
    role === "administrer_scoreboard" ||
    role === "udlejning" ||
    canAssignRoles(role)
  );
}

export function canManageTournament(role: UserRole): boolean {
  return role === "scoreboard_admin" || role === "administrer_scoreboard" || canAssignRoles(role);
}

export function canOpenAdmin(role: UserRole): boolean {
  return canManageVenues(role) || canEditSiteSettings(role);
}
