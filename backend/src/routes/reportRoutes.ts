import { Router } from "express";
import {
  salesReport,
  inventoryReport,
  expenseReport,
  profitReport,
  staffReport,
  stockMovementReport,
  expiryReport,
  lowStockReport,
  dailyReport,
  purchaseReport,
  insuranceReport,
  controlledSubstancesReport,
} from "../controllers/reportController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth, requirePermission("view_reports"));

router.get("/sales", salesReport);
router.get("/insurance", insuranceReport);
router.get("/controlled", controlledSubstancesReport);
router.get("/inventory", inventoryReport);
router.get("/expenses", expenseReport);
router.get("/profit", profitReport);
router.get("/staff", staffReport);
router.get("/stock-movements", stockMovementReport);
router.get("/expiry", expiryReport);
router.get("/low-stock", lowStockReport);
router.get("/daily", dailyReport);
router.get("/purchases", purchaseReport);

export default router;
