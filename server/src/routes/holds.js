import { Router } from "express";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { createHold, releaseHold } from "../services/holdService.js";
import { confirmBooking } from "../services/bookingService.js";

const router = Router();

// POST /api/events/:eventId/holds  { seatId }
router.post(
  "/:eventId/holds",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { seatId } = req.body;
    if (!seatId) throw new ApiError(400, "seatId is required");
    const hold = createHold(req.params.eventId, seatId, req.user.id);
    res.status(201).json({ hold });
  })
);

router.delete(
  "/:eventId/holds/:holdId",
  requireAuth,
  asyncHandler(async (req, res) => {
    releaseHold(req.params.holdId, req.user.id);
    res.status(204).end();
  })
);

// POST /api/events/:eventId/bookings { holdIds: [...] }
router.post(
  "/:eventId/bookings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { holdIds } = req.body;
    const booking = await confirmBooking({ holdIds, userId: req.user.id, eventId: req.params.eventId });
    res.status(201).json({ booking });
  })
);

export default router;
