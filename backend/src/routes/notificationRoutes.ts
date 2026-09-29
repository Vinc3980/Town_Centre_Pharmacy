import { Router } from "express";
import { listNotifications, getUnreadCount, markAsRead, markAllAsRead } from "../controllers/notificationController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, listNotifications);
router.get("/unread-count", requireAuth, getUnreadCount);
router.post("/:id/read", requireAuth, markAsRead);
router.post("/read-all", requireAuth, markAllAsRead);

export default router;
