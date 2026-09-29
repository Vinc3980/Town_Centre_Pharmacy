import { Router } from "express";
import {
  dashboardSummary,
  revenueTrend,
  paymentBreakdown,
  topMedicines,
  salesByStaff,
  inventoryAlerts,
  salesByCategory,
  staffDashboard,
  recentActivity,
  syncAlerts,
} from "../controllers/dashboardController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth, requirePermission("view_dashboard"));

router.get("/", dashboardSummary);
router.get("/revenue-trend", revenueTrend);
router.get("/payment-breakdown", paymentBreakdown);
router.get("/top-medicines", topMedicines);
router.get("/sales-by-staff", salesByStaff);
router.get("/sales-by-category", salesByCategory);
router.get("/inventory-alerts", inventoryAlerts);
router.get("/recent-activity", recentActivity);
router.get("/staff", staffDashboard);
router.post("/sync-alerts", syncAlerts);

export default router;
