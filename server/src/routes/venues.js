import { Router } from "express";
import db from "../db/db.js";
import { id as newId } from "../utils/ids.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

function parseVenue(row) {
  return { ...row, layout: JSON.parse(row.layout) };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = db.prepare("SELECT * FROM venues ORDER BY created_at DESC").all();
    res.json({ venues: rows.map(parseVenue) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = db.prepare("SELECT * FROM venues WHERE id = ?").get(req.params.id);
    if (!row) throw new ApiError(404, "Venue not found");
    res.json({ venue: parseVenue(row) });
  })
);

// layout: [{ rowLabel: 'A', category: 'Premium', seatCount: 10 }, ...]
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, address, layout } = req.body;
    if (!name || !address || !Array.isArray(layout) || layout.length === 0) {
      throw new ApiError(400, "name, address and a non-empty layout array are required");
    }
    for (const row of layout) {
      if (!row.rowLabel || !row.category || !row.seatCount) {
        throw new ApiError(400, "Each layout row needs rowLabel, category and seatCount");
      }
    }
    const venue = {
      id: newId(),
      name,
      address,
      layout: JSON.stringify(layout),
      created_by: req.user.id,
    };
    db.prepare(
      "INSERT INTO venues (id, name, address, layout, created_by) VALUES (?, ?, ?, ?, ?)"
    ).run(venue.id, venue.name, venue.address, venue.layout, venue.created_by);
    res.status(201).json({ venue: parseVenue(venue) });
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM venues WHERE id = ?").get(req.params.id);
    if (!existing) throw new ApiError(404, "Venue not found");
    const { name, address, layout } = req.body;
    db.prepare("UPDATE venues SET name = ?, address = ?, layout = ? WHERE id = ?").run(
      name || existing.name,
      address || existing.address,
      layout ? JSON.stringify(layout) : existing.layout,
      req.params.id
    );
    res.json({ venue: parseVenue(db.prepare("SELECT * FROM venues WHERE id = ?").get(req.params.id)) });
  })
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const used = db.prepare("SELECT COUNT(*) c FROM events WHERE venue_id = ?").get(req.params.id).c;
    if (used > 0) throw new ApiError(400, "Cannot delete a venue that has events");
    db.prepare("DELETE FROM venues WHERE id = ?").run(req.params.id);
    res.status(204).end();
  })
);

export default router;
