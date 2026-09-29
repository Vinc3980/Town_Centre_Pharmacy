import { Router } from "express";
import {
  createSale, listSales, voidSale,
  getSaleReceipt, getSaleDetail, holdSale, listHeldSales, deleteHeldSale,
  resumeSale, requestRefund, approveRefund, listPendingRefunds, collectPayment,
  updateClaimStatus,
} from "../controllers/saleController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("view_reports"), listSales);
router.get("/held", requirePermission("process_sales"), listHeldSales);
router.get("/refunds/pending", requirePermission("process_refunds"), listPendingRefunds);
router.get("/:id/receipt", requirePermission("view_reports"), getSaleReceipt);
router.get("/:id", requirePermission("view_reports"), getSaleDetail);
router.post("/", requirePermission("process_sales"), createSale);
router.post("/hold", requirePermission("process_sales"), holdSale);
router.post("/refunds/:returnId/approve", requirePermission("process_refunds"), approveRefund);
router.post("/:id/resume", requirePermission("process_sales"), resumeSale);
router.post("/:id/collect-payment", requirePermission("process_sales"), collectPayment);
router.post("/:id/refund", requirePermission("process_refunds"), requestRefund);
router.post("/:id/void", requirePermission("process_refunds"), voidSale);
router.patch("/:id/claim-status", updateClaimStatus);
router.delete("/:id/held", requirePermission("process_sales"), deleteHeldSale);

export default router;
