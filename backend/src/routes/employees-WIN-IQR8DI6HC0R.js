const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { requireSuperAdmin } = require("../middleware/authorize");
const c = require("../controllers/employeeController");

router.get("/me",                 requireAuth, c.whoAmI);
router.get("/",                   requireAuth, c.listEmployees);
router.post("/",                  requireAuth, c.createEmployee);
router.post("/:id/reset-password",requireAuth, c.resetPassword);
router.put("/:id/role",           requireAuth, requireSuperAdmin(), c.updateEmployeeRole);
router.post("/:id/disable",       requireAuth, c.disableEmployee);
router.post("/:id/reactivate",    requireAuth, c.reactivateEmployee);
router.get("/login-activity",     requireAuth, c.loginActivity);

module.exports = router;