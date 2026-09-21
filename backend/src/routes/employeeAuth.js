const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { employeeLogin, employeeLogout } = require("../controllers/employeeAuthController");

router.post("/login",  employeeLogin);
router.post("/logout", requireAuth, employeeLogout);

module.exports = router;