const { verifyToken } = require("../utils/jwt");
const { err } = require("../utils/response");

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return err(res, "No token provided", 401);
  try {
    req.user = verifyToken(token);
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

module.exports = { requireAuth, requireAdmin, requireStaff };