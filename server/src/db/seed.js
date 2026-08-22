import "dotenv/config";
import db from "./db.js";
import { id as newId } from "../utils/ids.js";
import { hashPassword } from "../utils/auth.js";

console.log("Seeding database...");

// Wipe existing data (idempotent local dev seed)
db.exec(`
  DELETE FROM booking_seats; DELETE FROM bookings; DELETE FROM waitlist;
  DELETE FROM holds; DELETE FROM seats; DELETE FROM event_categories;
  DELETE FROM events; DELETE FROM venues; DELETE FROM users;
`);

function createUser(name, email, password, role) {
  const u = { id: newId(), name, email, password_hash: hashPassword(password), role };
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
    u.id, u.name, u.email, u.password_hash, u.role
  );
  return u;
}

const admin = createUser("Ava Admin", "admin@demo.com", "password123", "admin");
const organiser = createUser("Oscar Organiser", "organiser@demo.com", "password123", "organiser");
const customer1 = createUser("Casey Customer", "customer@demo.com", "password123", "customer");
const customer2 = createUser("Priya Patel", "priya@demo.com", "password123", "customer");
const customer3 = createUser("Raj Verma", "raj@demo.com", "password123", "customer");

function createVenue(name, address, layout) {
  const v = { id: newId(), name, address, layout: JSON.stringify(layout), created_by: admin.id };
  db.prepare("INSERT INTO venues (id, name, address, layout, created_by) VALUES (?, ?, ?, ?, ?)").run(
    v.id, v.name, v.address, v.layout, v.created_by
  );
  return v;
}

const pvrCinema = createVenue("PVR Cinemas - Vijay Nagar", "Vijay Nagar Square, Indore, MP", [
  { rowLabel: "A", category: "Premium", seatCount: 8 },
  { rowLabel: "B", category: "Premium", seatCount: 8 },
  { rowLabel: "C", category: "Standard", seatCount: 10 },
  { rowLabel: "D", category: "Standard", seatCount: 10 },
]);

const arena = createVenue("Phoenix Arena", "AB Road, Indore, MP", [
  { rowLabel: "A", category: "VIP", seatCount: 6 },
  { rowLabel: "B", category: "Gold", seatCount: 12 },
  { rowLabel: "C", category: "Silver", seatCount: 16 },
]);

function createEvent(organiserId, venue, title, description, eventType, dateTime, categoryPrices) {
  const eventId = newId();
  db.prepare(
    `INSERT INTO events (id, organiser_id, venue_id, title, description, event_type, date_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(eventId, organiserId, venue.id, title, description, eventType, dateTime);

  const layout = JSON.parse(venue.layout);
  const categoryIdByName = {};
  for (const catName of [...new Set(layout.map((r) => r.category))]) {
    const catId = newId();
    db.prepare("INSERT INTO event_categories (id, event_id, name, price) VALUES (?, ?, ?, ?)").run(
      catId, eventId, catName, categoryPrices[catName]
    );
    categoryIdByName[catName] = catId;
  }
  const insertSeat = db.prepare(
    `INSERT INTO seats (id, event_id, category_id, row_label, seat_number, label, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const seatIds = [];
  for (const row of layout) {
    for (let n = 1; n <= row.seatCount; n++) {
      const seatId = newId();
      const label = `${row.rowLabel}${n}`;
      insertSeat.run(seatId, eventId, categoryIdByName[row.category], row.rowLabel, n, label, "AVAILABLE");
      seatIds.push({ id: seatId, label, category: row.category, categoryId: categoryIdByName[row.category] });
    }
  }
  return { id: eventId, seatIds, categoryIdByName };
}

const movie = createEvent(
  organiser.id,
  pvrCinema,
  "Inception: 15th Anniversary Re-release",
  "Christopher Nolan's mind-bending thriller returns to the big screen.",
  "movie",
  "2026-09-12T19:30:00",
  { Premium: 450, Standard: 250 }
);

const concert = createEvent(
  organiser.id,
  arena,
  "Arijit Singh Live in Concert",
  "An evening of soulful live music.",
  "concert",
  "2026-10-05T18:00:00",
  { VIP: 3500, Gold: 2000, Silver: 1200 }
);

// Second, smaller movie event to demo browsing/filtering
createEvent(
  organiser.id,
  pvrCinema,
  "Dune: Part Three",
  "The saga concludes.",
  "movie",
  "2026-09-20T21:00:00",
  { Premium: 500, Standard: 300 }
);

// --- Simulate a sold-out VIP category on the concert to demo the waitlist ---
const vipSeats = concert.seatIds.filter((s) => s.category === "VIP");
const txn = db.transaction(() => {
  for (const seat of vipSeats) {
    db.prepare("UPDATE seats SET status = 'BOOKED' WHERE id = ?").run(seat.id);
  }
  const bookingId = newId();
  db.prepare(
    `INSERT INTO bookings (id, booking_ref, user_id, event_id, status, total_amount) VALUES (?, ?, ?, ?, 'CONFIRMED', ?)`
  ).run(bookingId, "TB-DEMOSOLD1", customer1.id, concert.id, vipSeats.length * 3500);
  for (const seat of vipSeats) {
    db.prepare("INSERT INTO booking_seats (id, booking_id, seat_id, price) VALUES (?, ?, ?, ?)").run(
      newId(), bookingId, seat.id, 3500
    );
  }
  // A couple of customers already waiting for a VIP seat to free up
  db.prepare(
    "INSERT INTO waitlist (id, event_id, category_id, user_id, status) VALUES (?, ?, ?, ?, 'WAITING')"
  ).run(newId(), concert.id, vipSeats[0]?.categoryId, customer2.id);
  db.prepare(
    "INSERT INTO waitlist (id, event_id, category_id, user_id, status) VALUES (?, ?, ?, ?, 'WAITING')"
  ).run(newId(), concert.id, vipSeats[0]?.categoryId, customer3.id);
});
txn();

console.log("Seed complete.");
console.log(`
Demo accounts (password: password123):
  Admin:     admin@demo.com
  Organiser: organiser@demo.com
  Customer:  customer@demo.com (also priya@demo.com, raj@demo.com)

Events created: "Inception: 15th Anniversary Re-release", "Arijit Singh Live in Concert" (VIP sold out - waitlist demo), "Dune: Part Three"
`);
