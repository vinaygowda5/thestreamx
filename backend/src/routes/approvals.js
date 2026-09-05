const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/authorize");
const c = require("../controllers/approvalController");

router.get("/",          requireAuth, requireSuperAdmin(), c.listApprovals);
router.get("/mine",      requireAuth, c.myRequests);
router.post("/:id/approve", requireAuth, requireSuperAdmin(), c.approveRequest);
router.post("/:id/reject",  requireAuth, requireSuperAdmin(), c.rejectRequest);

module.exports = router;