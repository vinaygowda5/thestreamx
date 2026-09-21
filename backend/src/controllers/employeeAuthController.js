const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { verifyPassword, isMobileUserAgent } = require("../utils/employeeAuth");
const { signToken } = require("../utils/jwt");

async function logLoginEvent(userId, eventType, req) {
  try {
    await sb.from("login_events").insert({
      user_id: userId, event_type: eventType,
      ip_address: req.ip || req.headers["x-forwarded-for"] || null,
      device_info: req.headers["user-agent"] || null,
    });
  } catch (e) { /* logging failure should never block login/logout itself */ }
}

// POST /api/employee-auth/login  { email, employeeId, password }
// This is the ONLY way employees/managers log in — no OTP, ever.
async function employeeLogin(req, res) {
  const { email, employeeId, password } = req.body;
  if (!email || !employeeId || !password) return err(res, "Email, Employee ID, and password are all required");

  const userAgent = req.headers["user-agent"] || "";

  // The actual security boundary — this cannot be bypassed by editing
  // frontend code, since it's enforced here on the server.
  if (isMobileUserAgent(userAgent)) {
    return err(res, "Employee accounts can only sign in from a desktop or laptop, not a mobile device.", 403);
  }

  const { data: user } = await sb.from("users")
    .select("id, name, email, employee_id, employee_password_hash, employee_role_id, employee_status")
    .eq("email", email.toLowerCase().trim())
    .eq("employee_id", employeeId.toUpperCase().trim())
    .single();

  if (!user) {
    return err(res, "Invalid email, Employee ID, or password", 401);
  }
  if (user.employee_status !== "ACTIVE") {
    await logLoginEvent(user.id, "LOGIN_FAILED", req);
    return err(res, `Account is ${user.employee_status}. Contact your Super Admin.`, 403);
  }

  const validPassword = await verifyPassword(password, user.employee_password_hash);
  if (!validPassword) {
    await logLoginEvent(user.id, "LOGIN_FAILED", req);
    return err(res, "Invalid email, Employee ID, or password", 401);
  }

  const { data: role } = await sb.from("roles").select("name,department,tier").eq("id", user.employee_role_id).single();

  await sb.from("users").update({
    last_login_at: new Date().toISOString(),
    last_login_ip: req.ip || req.headers["x-forwarded-for"] || null,
    last_login_device: userAgent,
  }).eq("id", user.id);
  await logLoginEvent(user.id, "LOGIN", req);

  const token = signToken({ id: user.id, email: user.email, role: "employee", employeeRole: role?.name });
  return ok(res, {
    token,
    user: { id: user.id, name: user.name, email: user.email, employeeId: user.employee_id, roleName: role?.name, department: role?.department, tier: role?.tier },
  }, "Login successful");
}

// POST /api/employee-auth/logout
async function employeeLogout(req, res) {
  await sb.from("users").update({ last_logout_at: new Date().toISOString() }).eq("id", req.user.id);
  await logLoginEvent(req.user.id, "LOGOUT", req);
  return ok(res, null, "Logged out");
}

module.exports = { employeeLogin, employeeLogout };