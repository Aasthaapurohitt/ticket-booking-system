<<<<<<< HEAD
# Marquee — Ticket Booking System

A full-stack ticket booking platform for movies and concerts: customers book seats from a live visual map, held seats auto-release on checkout abandonment, sold-out categories run a waitlist with automatic seat re-assignment on cancellation, and every confirmed booking generates a QR-code ticket delivered by email.

Built for the "Ticket Booking System" assignment — see [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) for the required design write-up.

## Features

- **Auth & roles** — JWT-based auth with `customer`, `organiser`, and `admin` roles, enforced on both the API (middleware) and the frontend (route guards).
- **Venue & event management** — Admins define venues with a per-row seat layout and category names; organisers create movie/concert listings on a venue with per-category pricing, which generates the full seat map for that show.
- **Visual seat map** — Live grid of seats colored by status (available / selected-by-you / held-by-someone-else / booked), updated in real time over Socket.IO as other customers hold or release seats.
- **Seat hold with TTL** — Selecting a seat creates a server-enforced, atomic, time-limited hold (default 10 minutes). Abandoned holds are automatically released by a backend scheduler — the frontend countdown is cosmetic only.
- **Concurrency-safe booking** — Two customers can never hold or book the same seat; verified with an automated 2-way and 10-way concurrent-request test (see `server/tests`).
- **Waitlist with auto-assignment** — Customers join a per-category waitlist once it's sold out. When a booking is cancelled, the freed seat is automatically offered to the next customer in FIFO order, with a time-limited (default 15 minute) offer window that cascades to the next person if unclaimed.
- **QR code + email** — Every confirmed booking gets a unique reference, a QR code encoding that reference, and a confirmation email (dev fallback via an auto-created Ethereal inbox if no SMTP is configured — see Email section below).
- **Booking history & cancellation** — Customers can view past bookings and cancel eligible ones, which triggers seat release + waitlist re-assignment.
- **Organiser dashboard** — Revenue, bookings count, seat status breakdown, and per-category sales for each of an organiser's events.
- **Admin venue management** — Create venues and seat layouts used by organisers.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite, React Router | Fast dev loop, component architecture matches the multi-page flow (browse → event → seat map → checkout → confirmation). |
| Backend | Node.js + Express | Minimal, well understood, easy to layer routes/services/middleware cleanly. |
| Database | SQLite (`better-sqlite3`), WAL mode | Zero external services to configure for evaluation; synchronous API makes transactional seat-hold logic simple to reason about and test; single-writer serialization is a natural fit for seat-concurrency guarantees. See trade-offs in `SYSTEM_DESIGN.md`. |
| Real-time | Socket.IO | Simple room-per-event broadcast model for seat/waitlist status pushes. |
| Auth | JWT + bcrypt | Stateless, standard, easy to enforce per-route roles. |
| QR | `qrcode` npm package | Generates a QR data URL server-side, embedded directly in the confirmation email and the booking-confirmation page. |
| Email | `nodemailer` | Works with any SMTP provider via env vars; falls back to an auto-created Ethereal test inbox (with a console-logged preview link) when no SMTP is configured, so the full flow works with zero setup. |

## Architecture

```
client/   React SPA — pages, components, api client, auth context, socket hook
server/
  src/
    db/          SQLite connection + schema + seed script
    routes/      Express routers (thin — validate input, call services)
    services/    Business logic: holds, bookings, waitlist, QR, email, scheduler
    middleware/  JWT auth, role guard, error handler
    utils/       ids/refs, JWT helpers, event bus for socket broadcast
```

Request flow for a booking: `EventDetail` page → `POST /events/:id/holds` (atomic conditional UPDATE) → seat shown as held in real time to all viewers → `POST /events/:id/bookings` with the held `holdIds` → transaction re-validates each hold, converts to `BOOKED` seats + a `bookings` row → QR generated → confirmation email sent (best-effort; booking still succeeds if email fails) → confirmation page with the ticket stub + QR.

Cancellation → waitlist flow: `POST /bookings/:id/cancel` → seats released to `AVAILABLE` → for each freed seat, `offerSeatToNextInQueue` re-reserves it (`HELD`) for the next FIFO waitlist entry and emails them a time-limited offer link → they accept via `POST /waitlist/:id/confirm`, which converts the reservation into a normal hold and runs it through the same booking-confirmation path.

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd ticket-booking-system
```

### 2. Backend
```bash
cd server
cp .env.example .env      # edit values if needed — defaults work out of the box
npm install
npm run seed               # creates the SQLite DB and demo data
npm start                  # or `npm run dev` for auto-restart on changes
```
The API runs on `http://localhost:4000` by default.

### 3. Frontend
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
The app runs on `http://localhost:5173` by default.

### Demo accounts (seeded, password `password123` for all)
| Role | Email |
|---|---|
| Admin | admin@demo.com |
| Organiser | organiser@demo.com |
| Customer | customer@demo.com (also priya@demo.com, raj@demo.com) |

The seed script also creates a concert with its VIP category already sold out and two customers already on the waitlist, so the waitlist flow is demonstrable immediately — just cancel the seeded VIP booking as `customer@demo.com` and watch the offer go out.

## Environment Variables

See `server/.env.example` and `client/.env.example` for the full list with comments. Key ones:

- `HOLD_TTL_SECONDS` — how long a seat hold lasts before auto-release (default 600).
- `WAITLIST_OFFER_TTL_SECONDS` — how long a waitlist offer stays open before cascading to the next person (default 900).
- `SWEEP_INTERVAL_MS` — how often the backend scheduler checks for expired holds/offers (default 15000).
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — optional; any free-tier SMTP provider works (Gmail App Password, Brevo, Mailtrap, etc). Leave blank for the Ethereal dev fallback.
- `JWT_SECRET` — change this for any real deployment.

**Never commit a real `.env` file** — only `.env.example` files with placeholder values are checked in.

## API Documentation

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <token>`.

| Method & Path | Auth | Description |
|---|---|---|
| `POST /auth/register` | — | Create an account (`role` optional, defaults to `customer`) |
| `POST /auth/login` | — | Returns `{ token, user }` |
| `GET /auth/me` | ✅ | Current user from token |
| `GET /venues` | — | List venues |
| `POST /venues` | admin | Create a venue with seat layout |
| `GET /events` | — | Browse/filter events (`?search=&type=&from=&to=`) |
| `GET /events/:id` | — | Event detail + categories + full seat map |
| `POST /events` | organiser/admin | Create an event (generates seats from the venue layout) |
| `POST /events/:id/holds` | ✅ | Atomically hold a seat, returns TTL/expiry |
| `DELETE /events/:id/holds/:holdId` | ✅ | Release your own hold early |
| `POST /events/:id/bookings` | ✅ | Confirm a booking from one or more `holdIds` |
| `GET /bookings/my` | ✅ | Your booking history |
| `GET /bookings/:id` | ✅ | Booking detail incl. QR code |
| `POST /bookings/:id/cancel` | ✅ | Cancel; releases seats + triggers waitlist offers |
| `POST /events/:id/waitlist` | ✅ | Join a category's waitlist (only when sold out) |
| `GET /waitlist/my` | ✅ | Your waitlist entries + offers |
| `POST /waitlist/:id/confirm` | ✅ | Accept a time-limited offer → books it |
| `GET /organiser/events` | organiser/admin | Your events |
| `GET /organiser/events/:id/summary` | organiser/admin | Revenue, seat totals, per-category sales |

Every error response is `{ "error": "message" }` with an appropriate HTTP status (400/401/403/404/409/500).

## Database Schema

`users` → `venues` (1 admin creates many) → `events` (references a venue + organiser) → `event_categories` (per-event pricing) → `seats` (per-event, per-category) → `holds` (temporary, TTL-bound) → `bookings` + `booking_seats` (confirmed purchases) → `waitlist` (per event+category+user, FIFO by `created_at`). Full DDL with comments is in `server/src/db/db.js`.

## Seat Hold Logic

See "Seat Hold and TTL Mechanism" in `SYSTEM_DESIGN.md`. Summary: atomic conditional `UPDATE`, backend-scheduled expiry sweep every `SWEEP_INTERVAL_MS`, booking confirmation re-validates expiry before converting.

## Concurrency Strategy

See "Concurrency Prevention" in `SYSTEM_DESIGN.md`. Summary: single atomic conditional `UPDATE` makes the check-and-reserve step indivisible; verified with an automated concurrent-request test.

## Waitlist Logic

See "Waitlist Auto-Assignment Flow" and "Time-Limited Offer Handling" in `SYSTEM_DESIGN.md`.

## Trade-offs

- **SQLite over Postgres/MongoDB** — zero external setup for evaluation, and its single-writer model directly supports the concurrency guarantee this assignment is graded on. Documented as the one place this wouldn't scale horizontally as-is.
- **In-process scheduler over a dedicated worker/cron** — simpler to run and demo; introduces a worst-case ~`SWEEP_INTERVAL_MS` delay between TTL expiry and seat release, which is acceptable at this scale.
- **Ethereal email fallback** — guarantees the full booking flow is demonstrable without requiring the evaluator to configure real SMTP credentials.

## Future Improvements

- Payment gateway integration (currently bookings are confirmed without a payment step).
- Seat-level pricing tiers within a category (e.g. front-row premium within "Premium").
- Push/SMS notifications alongside email for waitlist offers.
- Horizontal scaling: swap SQLite for Postgres with `SELECT ... FOR UPDATE`, move the scheduler to a dedicated worker process.
- Admin moderation tools for organiser-created events.

## Testing

Automated smoke/concurrency tests live in `server/tests/`. Run the server, then:
```bash
cd server
npm test
```
This covers: registration/login, full booking flow (hold → confirm → QR → email attempt), a 2-way and 10-way concurrent hold race (asserts exactly one winner), seat-hold TTL expiry end-to-end, and waitlist auto-assignment on cancellation (including offer accept).

## Deployment

Not deployed as part of this submission (no hosting credentials available in the environment this was built in). The app is deployment-ready for Render/Railway (backend, with a persistent disk for the SQLite file) and Vercel (frontend, static build) — set `VITE_API_URL`/`VITE_SOCKET_URL` on the frontend and the vars in `server/.env.example` on the backend.

## Known Limitations

- SQLite is file-based; a horizontally-scaled deployment would need to move to Postgres (the atomic-UPDATE concurrency pattern carries over directly).
- No payment step — bookings are confirmed as a pure reservation flow per the assignment scope.
- Email delivery depends on outbound network access to the configured SMTP host; in fully network-restricted environments only the Ethereal preview-link fallback will work.
=======
# ticket-booking-system
>>>>>>> 303132af30d355f6f26e9efe4c19f8131c163c75
