import { Router } from "express";
import {
  listMedicines, createMedicine, updateMedicine, deleteMedicine, discontinueMedicine,
  receiveStock, adjustStock, lowStockReport, expiryReport,
  lookupBarcode, uploadMedicineImageHandler, removeMedicineImage,
} from "../controllers/medicineController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";
import { uploadMedicineImage } from "../middleware/upload";

const router = Router();
router.use(requireAuth);

router.get("/barcode/:barcode", lookupBarcode);
router.get("/", listMedicines);
router.post("/", requirePermission("manage_medicines"), createMedicine);

router.post("/stock/receive", requirePermission("manage_inventory"), receiveStock);
router.post("/stock/adjust", requirePermission("perform_stock_adjustment"), adjustStock);
router.get("/reports/low-stock", requirePermission("view_reports"), lowStockReport);
router.get("/reports/expiry", requirePermission("view_reports"), expiryReport);

router.put("/:id", requirePermission("manage_medicines"), updateMedicine);
router.delete("/:id", requirePermission("manage_medicines"), deleteMedicine);
router.post("/:id/discontinue", requirePermission("manage_medicines"), discontinueMedicine);
router.post("/:id/image", requirePermission("manage_medicines"), uploadMedicineImage.single("image"), uploadMedicineImageHandler);
router.delete("/:id/image", requirePermission("manage_medicines"), removeMedicineImage);

export default router;
