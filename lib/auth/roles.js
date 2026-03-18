export const ALLOWED_ROLES = Object.freeze(["employee", "manager", "hr"]);

export function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ALLOWED_ROLES.includes(role) ? role : null;
}

export function routeForRole(role) {
  const safeRole = normalizeRole(role);

  if (safeRole === "employee") return "/employee";
  if (safeRole === "manager") return "/manager";
  if (safeRole === "hr") return "/hr";

  return "/onboarding";
}

export function expectedRoleRoute(pathname) {
  const value = String(pathname || "");
  if (value.startsWith("/employee")) return "/employee";
  if (value.startsWith("/manager")) return "/manager";
  if (value.startsWith("/hr")) return "/hr";
  return null;
}