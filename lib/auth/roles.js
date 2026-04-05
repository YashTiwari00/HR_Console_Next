export const ALLOWED_ROLES = Object.freeze(["employee", "manager", "hr", "leadership", "region-admin"]);

const ROLE_ALIASES = Object.freeze({
  "region-admin": "leadership",
});

export function normalizeRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!ALLOWED_ROLES.includes(raw)) return null;
  return ROLE_ALIASES[raw] || raw;
}

export function routeForRole(role) {
  const safeRole = normalizeRole(role);

  if (safeRole === "employee") return "/employee";
  if (safeRole === "manager") return "/manager";
  if (safeRole === "hr") return "/hr";
  if (safeRole === "leadership") return "/leadership";

  return "/onboarding";
}

export function expectedRoleRoute(pathname) {
  const value = String(pathname || "");
  if (value.startsWith("/employee")) return "/employee";
  if (value.startsWith("/manager")) return "/manager";
  if (value.startsWith("/hr")) return "/hr";
  if (value.startsWith("/region-admin")) return "/region-admin";
  if (value.startsWith("/leadership")) return "/leadership";
  return null;
}