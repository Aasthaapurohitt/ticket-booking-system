import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "index.js");
const TEST_DB = path.join(__dirname, "..", "..", "data", "test.db");
const PORT = 4501;
const BASE = `http://localhost:${PORT}/api`;

let child;

async function j(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function waitForHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not become healthy in time");
}

before(async () => {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(TEST_DB + suffix)) fs.unlinkSync(TEST_DB + suffix);
  }
  child = spawn("node", [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: TEST_DB,
      HOLD_TTL_SECONDS: "3",
      WAITLIST_OFFER_TTL_SECONDS: "3",
      SWEEP_INTERVAL_MS: "1000",
      JWT_SECRET: "test-secret",
    },
    stdio: "pipe",
  });
  await waitForHealth();
  // Seed with a fresh DB pointed at the same file the server just opened.
  await new Promise((resolve, reject) => {
    const seed = spawn("node", [path.join(__dirname, "..", "db", "seed.js")], {
      env: { ...process.env, DB_PATH: TEST_DB },
      stdio: "pipe",
    });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("seed failed"))));
  });
  // The running server opened the (then-empty) DB file before we seeded it via a
  // separate process; better-sqlite3 + WAL means a fresh connection to the same
  // path sees committed writes, so no restart is needed for reads. But to be
  // safe across platforms, restart the server against the now-seeded DB.
  child.kill();
  child = spawn("node", [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: TEST_DB,
      HOLD_TTL_SECONDS: "3",
      WAITLIST_OFFER_TTL_SECONDS: "3",
      SWEEP_INTERVAL_MS: "1000",
      JWT_SECRET: "test-secret",
    },
    stdio: "pipe",
  });
  await waitForHealth();
});

after(() => {
  if (child) child.kill();
});

async function login(email) {
  const r = await j("POST", "/auth/login", { email, password: "password123" });
  assert.equal(r.status, 200, `login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

test("registration + login issue a working JWT", async () => {
  const email = `newuser_${Date.now()}@test.com`;
  const reg = await j("POST", "/auth/register", { name: "New User", email, password: "password123" });
  assert.equal(reg.status, 201);
  const me = await j("GET", "/auth/me", null, reg.data.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);
});

test("protected routes reject requests without a token", async () => {
  const r = await j("GET", "/bookings/my");
  assert.equal(r.status, 401);
});

test("role restriction blocks a customer from creating a venue", async () => {
  const token = await login("customer@demo.com");
  const r = await j("POST", "/venues", { name: "x", address: "y", layout: [{ rowLabel: "A", category: "Std", seatCount: 2 }] }, token);
  assert.equal(r.status, 403);
});

test("full booking flow: hold -> confirm -> QR -> booking history", async () => {
  const token = await login("customer@demo.com");
  const events = await j("GET", "/events");
  const event = events.data.events.find((e) => e.title.includes("Inception"));
  const detail = await j("GET", `/events/${event.id}`);
  const seat = detail.data.seats.find((s) => s.status === "AVAILABLE");

  const hold = await j("POST", `/events/${event.id}/holds`, { seatId: seat.id }, token);
  assert.equal(hold.status, 201);
  assert.equal(hold.data.hold.status, "ACTIVE");

  const booking = await j("POST", `/events/${event.id}/bookings`, { holdIds: [hold.data.hold.id] }, token);
  assert.equal(booking.status, 201);
  assert.ok(booking.data.booking.bookingRef.startsWith("TB-"));
  assert.ok(booking.data.booking.qrCode.startsWith("data:image/"));

  const mine = await j("GET", "/bookings/my", null, token);
  assert.ok(mine.data.bookings.some((b) => b.id === booking.data.booking.id));
});

test("expired hold is rejected at booking confirmation", async () => {
  const token = await login("priya@demo.com");
  const events = await j("GET", "/events");
  const event = events.data.events.find((e) => e.title.includes("Dune"));
  const detail = await j("GET", `/events/${event.id}`);
  const seat = detail.data.seats.find((s) => s.status === "AVAILABLE");

  const hold = await j("POST", `/events/${event.id}/holds`, { seatId: seat.id }, token);
  assert.equal(hold.status, 201);

  await new Promise((r) => setTimeout(r, 4500)); // TTL=3s + sweep interval 1s

  const stale = await j("POST", `/events/${event.id}/bookings`, { holdIds: [hold.data.hold.id] }, token);
  assert.notEqual(stale.status, 201);

  const seatNow = await j("GET", `/events/${event.id}`);
  const seatState = seatNow.data.seats.find((s) => s.id === seat.id);
  assert.equal(seatState.status, "AVAILABLE");
});

test("concurrency: only one of many simultaneous hold requests for the same seat succeeds", async () => {
  const tokenA = await login("raj@demo.com");
  const tokenB = await login("customer@demo.com");
  const events = await j("GET", "/events");
  const event = events.data.events.find((e) => e.title.includes("Dune"));
  const detail = await j("GET", `/events/${event.id}`);
  const seat = detail.data.seats.find((s) => s.status === "AVAILABLE");

  const tokens = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? tokenA : tokenB));
  const results = await Promise.all(tokens.map((t) => j("POST", `/events/${event.id}/holds`, { seatId: seat.id }, t)));

  const wins = results.filter((r) => r.status === 201).length;
  const conflicts = results.filter((r) => r.status === 409).length;
  assert.equal(wins, 1, "exactly one request should win the seat");
  assert.equal(conflicts, 9, "the other nine should be rejected with 409");
});

test("waitlist: cancellation auto-offers the seat to the next customer in FIFO order", async () => {
  const tokenCasey = await login("customer@demo.com"); // holds the sold-out VIP booking (seed data)
  const tokenPriya = await login("priya@demo.com"); // 1st on VIP waitlist
  const tokenRaj = await login("raj@demo.com"); // 2nd on VIP waitlist

  const events = await j("GET", "/events");
  const concert = events.data.events.find((e) => e.title.includes("Arijit"));

  const myBookings = await j("GET", "/bookings/my", null, tokenCasey);
  const soldBooking = myBookings.data.bookings.find((b) => b.event_id === concert.id && b.status === "CONFIRMED");
  assert.ok(soldBooking, "seed data should include a confirmed sold-out VIP booking");

  const cancel = await j("POST", `/bookings/${soldBooking.id}/cancel`, null, tokenCasey);
  assert.equal(cancel.status, 200);

  await new Promise((r) => setTimeout(r, 400));

  const priyaWaitlist = await j("GET", "/waitlist/my", null, tokenPriya);
  const priyaEntry = priyaWaitlist.data.waitlist.find((w) => w.event_id === concert.id);
  assert.equal(priyaEntry.status, "OFFERED", "the first customer in the queue should receive the offer");

  const accept = await j("POST", `/waitlist/${priyaEntry.id}/confirm`, null, tokenPriya);
  assert.equal(accept.status, 201);
  assert.ok(accept.data.booking.bookingRef.startsWith("TB-"));

  // sanity: raj token was usable (queue had a second entry in seed data)
  const rajWaitlist = await j("GET", "/waitlist/my", null, tokenRaj);
  assert.ok(Array.isArray(rajWaitlist.data.waitlist));
});

test("cancellation is rejected for a booking that isn't yours", async () => {
  const tokenA = await login("priya@demo.com");
  const tokenB = await login("raj@demo.com");
  const events = await j("GET", "/events");
  const event = events.data.events.find((e) => e.title.includes("Inception"));
  const detail = await j("GET", `/events/${event.id}`);
  const seat = detail.data.seats.find((s) => s.status === "AVAILABLE");
  const hold = await j("POST", `/events/${event.id}/holds`, { seatId: seat.id }, tokenA);
  const booking = await j("POST", `/events/${event.id}/bookings`, { holdIds: [hold.data.hold.id] }, tokenA);

  const cancelAttempt = await j("POST", `/bookings/${booking.data.booking.id}/cancel`, null, tokenB);
  assert.equal(cancelAttempt.status, 403);
});
