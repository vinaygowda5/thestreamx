const { verifyToken } = require("../utils/jwt");
const { err } = require("../utils/response");
const sb = require("../models/db");

// Employee tokens last 30 days, so every request re-checks that the account still exists and is ACTIVE
// (cached 20 s). Deleting or disabling an employee therefore locks them out within seconds.
const empCache = new Map();
async function employeeStillActive(id) {
  const c = empCache.get(id);
  if (c && Date.now() - c.t < 20000) return c.ok;
  const { data, error } = await sb.from("users").select("id,employee_status").eq("id", id).maybeSingle();
  if (error) return true;                      // database hiccup: do not lock everyone out
  const ok = !!data && data.employee_status === "ACTIVE";
  empCache.set(id, { ok, t: Date.now() });
  return ok;
}
function forgetEmployee(id) { empCache.delete(id); }

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return err(res, "No token provided", 401);
  try {
    req.user = verifyToken(token);
    if (req.user.role === "employee") {
      return employeeStillActive(req.user.id)
        .then(ok => ok ? next() : err(res, "This employee account has been closed", 401))
        .catch(() => next());
    }
    next();
  } catch(e) {
    return err(res, "Invalid or expired token", 401);
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") return err(res, "Admin access only", 403);
    next();
  });
}

// requireStaff — anyone with an Admin-panel login: the legacy full-admin
// account OR any active employee (Finance Manager, Content Manager, etc).
// Use this for panel endpoints that every employee should be able to read
// (dashboard stats, revenue analytics); use requireAdmin only for things
// that must stay owner-only regardless of employee role.
function requireStaff(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin" && req.user.role !== "employee") return err(res, "Staff access only", 403);
    next();
  });
}

module.exports = { forgetEmployee,  requireAuth, requireAdmin, requireStaff };