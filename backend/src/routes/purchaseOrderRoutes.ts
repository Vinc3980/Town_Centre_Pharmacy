import { Router } from "express";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  updateStatus,
  receiveOrder,
  deletePurchaseOrder,
} from "../controllers/purchaseOrderController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.post("/", requirePermission("manage_inventory"), createPurchaseOrder);
router.get("/", requirePermission("view_reports"), listPurchaseOrders);
router.get("/:id", requirePermission("view_reports"), getPurchaseOrder);
router.put("/:id", requirePermission("manage_inventory"), updatePurchaseOrder);
router.put("/:id/status", requirePermission("manage_inventory"), updateStatus);
router.post("/:id/receive", requirePermission("manage_inventory"), receiveOrder);
router.delete("/:id", requirePermission("manage_inventory"), deletePurchaseOrder);

export default router;
