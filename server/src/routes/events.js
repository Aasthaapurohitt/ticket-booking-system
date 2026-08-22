import { Router } from "express";
import db from "../db/db.js";
import { id as newId } from "../utils/ids.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

function generateSeatsForEvent(eventId, venueLayout, categoryPriceByName) {
  const insertCategory = db.prepare(
    "INSERT INTO event_categories (id, event_id, name, price) VALUES (?, ?, ?, ?)"
  );
  const insertSeat = db.prepare(
    `INSERT INTO seats (id, event_id, category_id, row_label, seat_number, label, status)
     VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE')`
  );

  const categoryIdByName = {};
  const distinctCategories = [...new Set(venueLayout.map((r) => r.category))];
  for (const catName of distinctCategories) {
    const price = categoryPriceByName[catName];
    if (price === undefined) throw new ApiError(400, `Missing price for category "${catName}"`);
    const catId = newId();
    insertCategory.run(catId, eventId, catName, price);
    categoryIdByName[catName] = catId;
  }

  for (const row of venueLayout) {
    const catId = categoryIdByName[row.category];
    for (let n = 1; n <= row.seatCount; n++) {
      insertSeat.run(newId(), eventId, catId, row.rowLabel, n, `${row.rowLabel}${n}`);
    }
  }
}

// GET /api/events?search=&type=&from=&to=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, type, from, to } = req.query;
    let sql = `SELECT e.*, v.name as venue_name, v.address as venue_address
               FROM events e JOIN venues v ON v.id = e.venue_id
               WHERE e.status = 'PUBLISHED'`;
    const params = [];
    if (search) {
      sql += " AND (e.title LIKE ? OR v.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      sql += " AND e.event_type = ?";
      params.push(type);
    }
    if (from) {
      sql += " AND e.date_time >= ?";
      params.push(from);
    }
    if (to) {
      sql += " AND e.date_time <= ?";
      params.push(to);
    }
    sql += " ORDER BY e.date_time ASC";
    const events = db.prepare(sql).all(...params);
    res.json({ events });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const event = db
      .prepare(
        `SELECT e.*, v.name as venue_name, v.address as venue_address
         FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = ?`
      )
      .get(req.params.id);
    if (!event) throw new ApiError(404, "Event not found");

    const categories = db.prepare("SELECT * FROM event_categories WHERE event_id = ?").all(event.id);
    const seats = db
      .prepare("SELECT id, row_label, seat_number, label, status, category_id FROM seats WHERE event_id = ? ORDER BY row_label, seat_number")
      .all(event.id);

    const availability = categories.map((c) => ({
      ...c,
      available: seats.filter((s) => s.category_id === c.id && s.status === "AVAILABLE").length,
      total: seats.filter((s) => s.category_id === c.id).length,
    }));

    res.json({ event, categories: availability, seats });
  })
);

router.post(
  "/",
  requireAuth,
  requireRole("organiser", "admin"),
  asyncHandler(async (req, res) => {
    const { title, description, eventType, venueId, dateTime, categoryPrices } = req.body;
    if (!title || !venueId || !dateTime || !categoryPrices) {
      throw new ApiError(400, "title, venueId, dateTime and categoryPrices are required");
    }
    const venue = db.prepare("SELECT * FROM venues WHERE id = ?").get(venueId);
    if (!venue) throw new ApiError(404, "Venue not found");

    const eventId = newId();
    const txn = db.transaction(() => {
      db.prepare(
        `INSERT INTO events (id, organiser_id, venue_id, title, description, event_type, date_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(eventId, req.user.id, venueId, title, description || "", eventType || "movie", dateTime);

      generateSeatsForEvent(eventId, JSON.parse(venue.layout), categoryPrices);
    });
    txn();

    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
    res.status(201).json({ event });
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole("organiser", "admin"),
  asyncHandler(async (req, res) => {
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
    if (!event) throw new ApiError(404, "Event not found");
    if (event.organiser_id !== req.user.id && req.user.role !== "admin") {
      throw new ApiError(403, "You can only edit your own events");
    }
    const { title, description, dateTime, status } = req.body;
    db.prepare(
      "UPDATE events SET title = ?, description = ?, date_time = ?, status = ? WHERE id = ?"
    ).run(
      title || event.title,
      description ?? event.description,
      dateTime || event.date_time,
      status || event.status,
      req.params.id
    );
    res.json({ event: db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id) });
  })
);

export default router;
