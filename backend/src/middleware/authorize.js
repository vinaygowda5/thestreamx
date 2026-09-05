const sb = require("../models/db");
const { err } = require("../utils/response");
const { logAudit } = require("./audit");

// Loads the employee's role name + effective permission set once per request.
// Cheap enough for now; can be cached later if it becomes a bottleneck.
async function loadEmployeeContext(userId) {
  const { data: user } = await sb.from("users")
    .select("id, employee_role_id, employee_status, role, name")
    .eq("id", userId).single();
  if (!user) return null;

  // Legacy fallback: existing role==="admin" accounts are treated as
  // SUPER_ADMIN even before they're migrated to the new roles table.
  // This is what keeps your current admin login working unchanged.
  if (!user.employee_role_id && user.role === "admin") {
    return { userId, roleName: "SUPER_ADMIN", status: "ACTIVE", permissions: new Set(["*"]) };
  }
  if (!user.employee_role_id) return null; // not an employee at all

  if (user.employee_status && user.employee_status !== "ACTIVE") {
    return { userId, roleName: null, status: user.employee_status, permissions: new Set() };
  }

  const { data: role } = await sb.from("roles").select("id, name").eq("id", user.employee_role_id).single();
  const { data: rolePerms } = await sb.from("role_permissions")
    .select("permissions(key)").eq("role_id", user.employee_role_id);
  const { data: extraPerms } = await sb.from("employee_permissions")
    .select("permissions(key)").eq("user_id", userId);

  const permissions = new Set([
    ...(rolePerms || []).map(r => r.permissions?.key).filter(Boolean),
    ...(extraPerms || []).map(r => r.permissions?.key).filter(Boolean),
  ]);

  return { userId, roleName: role?.name || null, status: "ACTIVE", permissions };
}

// authorize("content.delete") — use as middleware after requireAuth.
// Returns 403 for anything that doesn't check out: no auth, disabled
// account, wrong role, missing permission. This is the real security
// boundary — the frontend hiding a button is not.
function authorize(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) return err(res, "Not authenticated", 401);

      const ctx = await loadEmployeeContext(req.user.id);
      if (!ctx) {
        await logAudit({ req, action: `AUTHZ_DENIED:${permissionKey}`, result: "denied", reason: "not an employee" });
        return err(res, "Forbidden", 403);
      }
      if (ctx.status !== "ACTIVE") {
        await logAudit({ req, action: `AUTHZ_DENIED:${permissionKey}`, result: "denied", reason: `account ${ctx.status}` });
        return err(res, "Account disabled", 403);
      }
      const allowed = ctx.permissions.has("*") || ctx.permissions.has(permissionKey);
      if (!allowed) {
        await logAudit({ req, action: `AUTHZ_DENIED:${permissionKey}`, result: "denied", reason: "missing permission" });
        return err(res, "Forbidden — missing permission: " + permissionKey, 403);
      }

      req.employeeRole = ctx.roleName;
      req.isSuperAdmin = ctx.roleName === "SUPER_ADMIN";
      next();
    } catch (e) {
      console.error("authorize() error:", e);
      return err(res, "Authorization check failed", 500);
    }
  };
}

// requireSuperAdmin — for the handful of things ONLY the owner can do
// (approve/reject requests, manage employees, view audit logs). Simpler
// and more explicit than routing these through the generic permission
// system, and matches the spec's intent exactly.
function requireSuperAdmin() {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) return err(res, "Not authenticated", 401);
      const ctx = await loadEmployeeContext(req.user.id);
      if (!ctx || ctx.roleName !== "SUPER_ADMIN") {
        await logAudit({ req, action: "AUTHZ_DENIED:SUPER_ADMIN_ONLY", result: "denied" });
        return err(res, "Super Admin access required", 403);
      }
      req.employeeRole = ctx.roleName;
      req.isSuperAdmin = true;
      next();
    } catch (e) {
      console.error("requireSuperAdmin() error:", e);
      return err(res, "Authorization check failed", 500);
    }
  };
}

// identify() — loads employee context (isSuperAdmin, employeeRole) without
// gating on any specific permission. Use this on routes where a non-Super-
// Admin employee should still reach the controller — because the controller
// itself decides "execute directly" vs "create an approval request" (see
// adminController.deleteContent for the concrete example). Still blocks
// disabled/suspended accounts and non-employees.
function identify() {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) return err(res, "Not authenticated", 401);
      const ctx = await loadEmployeeContext(req.user.id);
      if (!ctx) return err(res, "Forbidden", 403);
      if (ctx.status !== "ACTIVE") return err(res, "Account disabled", 403);
      req.employeeRole = ctx.roleName;
      req.isSuperAdmin = ctx.roleName === "SUPER_ADMIN";
      next();
    } catch (e) {
      console.error("identify() error:", e);
      return err(res, "Authorization check failed", 500);
    }
  };
}

module.exports = { authorize, requireSuperAdmin, identify, loadEmployeeContext };