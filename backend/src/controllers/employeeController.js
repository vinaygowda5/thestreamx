const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { logAudit } = require("../middleware/audit");

async function listEmployees(req, res) {
  const { data, error } = await sb.from("users")
    .select("id,name,email,employee_status,created_at,role:employee_role_id(name)")
    .not("employee_role_id", "is", null);
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

async function createEmployee(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can create employees", 403);
  const { userId, roleName } = req.body; // promote an existing user to employee
  if (!userId || !roleName) return err(res, "userId and roleName required");

  const { data: role } = await sb.from("roles").select("id").eq("name", roleName).single();
  if (!role) return err(res, "Unknown role: " + roleName, 400);

  const { data, error } = await sb.from("users")
    .update({ employee_role_id: role.id, employee_status: "ACTIVE" })
    .eq("id", userId).select().single();
  if (error) return err(res, error.message, 500);

  await logAudit({ req, action: "CREATED_EMPLOYEE", resourceType: "employee", resourceId: userId, after: { roleName } });
  return ok(res, data, "Employee created");
}

async function updateEmployeeRole(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can change roles", 403);
  const { id } = req.params;
  const { roleName } = req.body;

  const { data: role } = await sb.from("roles").select("id").eq("name", roleName).single();
  if (!role) return err(res, "Unknown role: " + roleName, 400);

  const { data: before } = await sb.from("users").select("employee_role_id").eq("id", id).single();
  const { data, error } = await sb.from("users").update({ employee_role_id: role.id }).eq("id", id).select().single();
  if (error) return err(res, error.message, 500);

  await logAudit({ req, action: "CHANGED_EMPLOYEE_ROLE", resourceType: "employee", resourceId: id, before, after: { roleName } });
  return ok(res, data, "Role updated");
}

// Full offboarding per spec section 9 — sessions/tokens revoked immediately,
// account disabled, audit history preserved (never deleted).
async function disableEmployee(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can disable employees", 403);
  const { id } = req.params;

  await sb.from("users").update({ employee_status: "DISABLED" }).eq("id", id);
  await sb.from("sessions").update({ revoked: true }).eq("user_id", id);

  await logAudit({ req, action: "DISABLED_EMPLOYEE", resourceType: "employee", resourceId: id });
  return ok(res, null, "Employee disabled — all sessions revoked");
}

async function reactivateEmployee(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can reactivate employees", 403);
  const { id } = req.params;
  await sb.from("users").update({ employee_status: "ACTIVE" }).eq("id", id);
  await logAudit({ req, action: "REACTIVATED_EMPLOYEE", resourceType: "employee", resourceId: id });
  return ok(res, null, "Employee reactivated");
}

module.exports = { listEmployees, createEmployee, updateEmployeeRole, disableEmployee, reactivateEmployee };