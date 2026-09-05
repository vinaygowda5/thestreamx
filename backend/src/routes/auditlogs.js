const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/authorize");
const c = require("../controllers/auditController");

router.get("/", requireAuth, requireSuperAdmin(), c.listAuditLogs);

module.exports = router;