import { Router } from "express";
import {
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer,
  addVitals, addVisit, uploadCustomerImage, generateCustomerReport,
} from "../controllers/customerController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";
import multer from "multer";
import path from "path";

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "../../uploads/customers"),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router = Router();
router.use(requireAuth);

router.get("/", listCustomers);
router.get("/:id", getCustomer);
router.get("/:id/report", requirePermission("view_reports"), generateCustomerReport);
router.post("/", requirePermission("process_sales"), createCustomer);
router.put("/:id", requirePermission("process_sales"), updateCustomer);
router.delete("/:id", requirePermission("process_sales"), deleteCustomer);
router.post("/:id/vitals", requirePermission("process_sales"), addVitals);
router.post("/:id/visits", requirePermission("process_sales"), addVisit);
router.post("/:id/image", requirePermission("process_sales"), upload.single("image"), uploadCustomerImage);

export default router;
