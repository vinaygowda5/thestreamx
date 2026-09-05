const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { logAudit } = require("../middleware/audit");
const { loadEmployeeContext } = require("../middleware/authorize");

// Lets the frontend check "am I an employee, and what can I see" right
// after login — this is what makes the Admin tab/routes actually work
// for non-Super-Admin employees, not just the legacy admin flag.
async function whoAmI(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx || !ctx.roleName) return ok(res, { isEmployee: false });
  return ok(res, { isEmployee: true, roleName: ctx.roleName, status: ctx.status });
}

async function listEmployees(req, res) {
  const { data, error } = await sb.from("users")
    .select("id,name,email,employee_status,created_at,role:employee_role_id(name)")
    .not("employee_role_id", "is", null);
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

async function createEmployee(req, res) {
  if (!req.isSuperAdmin) return err(res, "Only Super Admin can create employees", 403);
  const { email, roleName } = req.body;
  if (!email || !roleName) return err(res, "email and roleName required");

  const { data: existingUser } = await sb.from("users").select("id").ilike("email", email.toLowerCase().trim()).single();
  if (!existingUser) return err(res, "No user found with that email — they must sign up on StreamX first", 404);

  const { data: role } = await sb.from("roles").select("id").eq("name", roleName).single();
  if (!role) return err(res, "Unknown role: " + roleName, 400);

  const { data, error } = await sb.from("users")
    .update({ employee_role_id: role.id, employee_status: "ACTIVE" })
    .eq("id", existingUser.id).select().single();
  if (error) return err(res, error.message, 500);

  await logAudit({ req, action: "CREATED_EMPLOYEE", resourceType: "employee", resourceId: existingUser.id, after: { roleName, email } });
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

module.exports = { listEmployees, createEmployee, updateEmployeeRole, disableEmployee, reactivateEmployee, whoAmI };