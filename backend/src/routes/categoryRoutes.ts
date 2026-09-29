import { Router } from "express";
import { listCategories } from "../controllers/categoryController";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", listCategories);

export default router;
