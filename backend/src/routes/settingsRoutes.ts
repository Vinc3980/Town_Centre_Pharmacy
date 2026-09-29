import { Router } from "express";
import {
  getPharmacyInfo, updatePharmacyInfo, uploadPharmacyLogo, removePharmacyLogo,
  getInventorySettings, updateInventorySettings,
  getSalesSettings, updateSalesSettings,
  getSecuritySettings, updateSecuritySettings,
  getAllSettings,
} from "../controllers/pharmacyController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";
import { uploadPharmacyLogo as uploadLogoMulter } from "../middleware/upload";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("manage_settings"), getAllSettings);

router.get("/pharmacy", requirePermission("manage_settings"), getPharmacyInfo);
router.put("/pharmacy", requirePermission("manage_settings"), updatePharmacyInfo);
router.post("/pharmacy/logo", requirePermission("manage_settings"), uploadLogoMulter.single("logo"), uploadPharmacyLogo);
router.delete("/pharmacy/logo", requirePermission("manage_settings"), removePharmacyLogo);

router.get("/inventory", requirePermission("manage_settings"), getInventorySettings);
router.put("/inventory", requirePermission("manage_settings"), updateInventorySettings);

router.get("/sales", requirePermission("manage_settings"), getSalesSettings);
router.put("/sales", requirePermission("manage_settings"), updateSalesSettings);

router.get("/security", requirePermission("manage_settings"), getSecuritySettings);
router.put("/security", requirePermission("manage_settings"), updateSecuritySettings);

export default router;
