const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/authorize");
const c = require("../controllers/employeeController");

router.get("/",              requireAuth, requireSuperAdmin(), c.listEmployees);
router.post("/",             requireAuth, requireSuperAdmin(), c.createEmployee);
router.put("/:id/role",      requireAuth, requireSuperAdmin(), c.updateEmployeeRole);
router.post("/:id/disable",  requireAuth, requireSuperAdmin(), c.disableEmployee);
router.post("/:id/reactivate", requireAuth, requireSuperAdmin(), c.reactivateEmployee);

module.exports = router;