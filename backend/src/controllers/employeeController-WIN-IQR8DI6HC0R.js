const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { logAudit } = require("../middleware/audit");
const { loadEmployeeContext } = require("../middleware/authorize");
const { generateEmployeeId, generatePassword, hashPassword } = require("../utils/employeeAuth");

async function whoAmI(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx || !ctx.roleName) return ok(res, { isEmployee: false });
  return ok(res, { isEmployee: true, roleName: ctx.roleName, department: ctx.department, tier: ctx.tier, status: ctx.status });
}

async function listEmployees(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);

  let query = sb.from("users")
    .select("id,name,email,employee_id,employee_status,last_login_at,last_logout_at,managed_by,created_at,role:employee_role_id(name,department,tier)")
    .not("employee_role_id", "is", null);

  if (ctx.tier === "SUPER") {
    // no filter
  } else if (ctx.tier === "MANAGER") {
    const { data: deptRoles } = await sb.from("roles").select("id").eq("department", ctx.department).neq("tier", "MANAGER");
    query = query.in("employee_role_id", (deptRoles || []).map(r => r.id));
  } else if (ctx.tier === "TEAM_LEADER") {
    query = query.eq("managed_by", req.user.id);
  } else {
    return err(res, "Forbidden", 403);
  }

  const { data, error } = await query;
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

async function createEmployee(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);

  const { name, email, roleName } = req.body;
  if (!name || !email || !roleName) return err(res, "name, email, and roleName are required");

  const { data: targetRole } = await sb.from("roles").select("id,name,department,tier").eq("name", roleName).single();
  if (!targetRole) return err(res, "Unknown role: " + roleName, 400);

  if (ctx.tier !== "SUPER") {
    if (targetRole.department !== ctx.department) return err(res, "You can only add employees within your own department", 403);
    const tierOrder = { MANAGER: 3, TEAM_LEADER: 2, TEAM_MEMBER: 1 };
    if (tierOrder[targetRole.tier] >= tierOrder[ctx.tier]) return err(res, "You cannot create a role at or above your own level", 403);
  }

  const { data: existing } = await sb.from("users").select("id").eq("email", email.toLowerCase().trim()).single();
  if (existing) return err(res, "An account with that email already exists", 409);

  const employeeId = generateEmployeeId();
  const plainPassword = generatePassword();
  const passwordHash = await hashPassword(plainPassword);

  const { data: newUser, error } = await sb.from("users").insert({
    name, email: email.toLowerCase().trim(),
    employee_id: employeeId, employee_password_hash: passwordHash,
    employee_role_id: targetRole.id, employee_status: "ACTIVE",
    managed_by: req.user.id,
  }).select().single();
  if (error) return err(res, error.message, 500);

  await logAudit({ req, action: "CREATED_EMPLOYEE", resourceType: "employee", resourceId: newUser.id, after: { roleName, department: targetRole.department } });

  return ok(res, {
    id: newUser.id, name, email: newUser.email,
    employeeId, password: plainPassword, roleName: targetRole.name, department: targetRole.department,
  }, "Employee created — save this password now, it will not be shown again");
}

async function resetPassword(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);
  const { id } = req.params;

  if (ctx.tier !== "SUPER") {
    const { data: target } = await sb.from("users").select("managed_by, role:employee_role_id(department)").eq("id", id).single();
    if (!target || target.role?.department !== ctx.department) return err(res, "Forbidden", 403);
  }

  const plainPassword = generatePassword();
  const passwordHash = await hashPassword(plainPassword);
  const { error } = await sb.from("users").update({ employee_password_hash: passwordHash }).eq("id", id);
  if (error) return err(res, error.message, 500);

  await logAudit({ req, action: "RESET_EMPLOYEE_PASSWORD", resourceType: "employee", resourceId: id });
  return ok(res, { password: plainPassword }, "Password reset — save it now, it will not be shown again");
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

async function disableEmployee(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);
  const { id } = req.params;

  if (ctx.tier !== "SUPER") {
    const { data: target } = await sb.from("users").select("role:employee_role_id(department)").eq("id", id).single();
    if (!target || target.role?.department !== ctx.department) return err(res, "Forbidden", 403);
  }

  await sb.from("users").update({ employee_status: "DISABLED" }).eq("id", id);
  await sb.from("sessions").update({ revoked: true }).eq("user_id", id);

  await logAudit({ req, action: "DISABLED_EMPLOYEE", resourceType: "employee", resourceId: id });
  return ok(res, null, "Employee disabled — all sessions revoked");
}

async function reactivateEmployee(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);
  const { id } = req.params;

  if (ctx.tier !== "SUPER") {
    const { data: target } = await sb.from("users").select("role:employee_role_id(department)").eq("id", id).single();
    if (!target || target.role?.department !== ctx.department) return err(res, "Forbidden", 403);
  }

  await sb.from("users").update({ employee_status: "ACTIVE" }).eq("id", id);
  await logAudit({ req, action: "REACTIVATED_EMPLOYEE", resourceType: "employee", resourceId: id });
  return ok(res, null, "Employee reactivated");
}

async function loginActivity(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);

  let userIds = null;
  if (ctx.tier !== "SUPER") {
    if (ctx.tier === "MANAGER") {
      const { data: deptRoles } = await sb.from("roles").select("id").eq("department", ctx.department);
      const { data: deptUsers } = await sb.from("users").select("id").in("employee_role_id", (deptRoles || []).map(r => r.id));
      userIds = (deptUsers || []).map(u => u.id);
    } else if (ctx.tier === "TEAM_LEADER") {
      const { data: reports } = await sb.from("users").select("id").eq("managed_by", req.user.id);
      userIds = (reports || []).map(u => u.id);
    } else {
      return err(res, "Forbidden", 403);
    }
  }

  let query = sb.from("login_events").select("*, user:user_id(name,email,employee_id)").order("created_at", { ascending: false }).limit(200);
  if (userIds) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

module.exports = { whoAmI, listEmployees, createEmployee, resetPassword, updateEmployeeRole, disableEmployee, reactivateEmployee, loginActivity };