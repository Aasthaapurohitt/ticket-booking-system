import { Router } from "express";
import db from "../db/db.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get(
  "/events",
  requireAuth,
  requireRole("organiser", "admin"),
  asyncHandler(async (req, res) => {
    const events = db
      .prepare(
        `SELECT e.*, v.name as venue_name FROM events e JOIN venues v ON v.id = e.venue_id
         WHERE e.organiser_id = ? ORDER BY e.date_time DESC`
      )
      .all(req.user.id);
    res.json({ events });
  })
);

router.get(
  "/events/:id/summary",
  requireAuth,
  requireRole("organiser", "admin"),
  asyncHandler(async (req, res) => {
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
    if (!event) throw new ApiError(404, "Event not found");
    if (event.organiser_id !== req.user.id && req.user.role !== "admin") {
      throw new ApiError(403, "You can only view your own events");
    }

    const seatTotals = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM seats WHERE event_id = ? GROUP BY status`
      )
      .all(event.id);

    const revenue = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as bookingCount
         FROM bookings WHERE event_id = ? AND status = 'CONFIRMED'`
      )
      .get(event.id);

    const byCategory = db
      .prepare(
        `SELECT ec.name, COUNT(bs.id) as seatsSold, COALESCE(SUM(bs.price),0) as revenue
         FROM event_categories ec
         LEFT JOIN seats s ON s.category_id = ec.id
         LEFT JOIN booking_seats bs ON bs.seat_id = s.id
         LEFT JOIN bookings b ON b.id = bs.booking_id AND b.status = 'CONFIRMED'
         WHERE ec.event_id = ?
         GROUP BY ec.id`
      )
      .all(event.id);

    const waitlistCount = db
      .prepare("SELECT COUNT(*) c FROM waitlist WHERE event_id = ? AND status = 'WAITING'")
      .get(event.id).c;

    res.json({
      event,
      seatTotals,
      revenue,
      byCategory,
      waitlistCount,
    });
  })
);

export default router;
