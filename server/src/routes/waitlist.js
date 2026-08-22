import { Router } from "express";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  joinWaitlist,
  queuePosition,
  confirmWaitlistOffer,
  listWaitlistForUser,
  getWaitlistEntry,
} from "../services/waitlistService.js";
import { confirmBooking } from "../services/bookingService.js";

const router = Router();
// Sub-router mounted separately at /api/events for event-scoped waitlist actions.
export const eventWaitlistRouter = Router();

// POST /api/events/:eventId/waitlist { categoryId }
eventWaitlistRouter.post(
  "/:eventId/waitlist",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.body;
    if (!categoryId) throw new ApiError(400, "categoryId is required");
    const entry = joinWaitlist(req.params.eventId, categoryId, req.user.id);
    res.status(201).json({ waitlistEntry: entry, position: queuePosition(entry.id) });
  })
);

// GET /api/waitlist/my
router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = listWaitlistForUser(req.user.id).map((e) => ({
      ...e,
      position: e.status === "WAITING" ? queuePosition(e.id) : null,
    }));
    res.json({ waitlist: entries });
  })
);

// POST /api/waitlist/:id/confirm  - accept a time-limited offer
router.post(
  "/:id/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entry = getWaitlistEntry(req.params.id);
    if (!entry) throw new ApiError(404, "Waitlist entry not found");
    const { holdId, eventId } = await confirmWaitlistOffer(req.params.id, req.user.id);
    const booking = await confirmBooking({ holdIds: [holdId], userId: req.user.id, eventId });
    res.status(201).json({ booking });
  })
);

export default router;
