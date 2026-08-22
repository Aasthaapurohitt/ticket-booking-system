import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import db from "./db/db.js"; // ensures schema is created on boot
import authRoutes from "./routes/auth.js";
import venueRoutes from "./routes/venues.js";
import eventRoutes from "./routes/events.js";
import holdRoutes from "./routes/holds.js";
import bookingRoutes from "./routes/bookings.js";
import waitlistRoutes, { eventWaitlistRouter } from "./routes/waitlist.js";
import organiserRoutes from "./routes/organiser.js";

import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { startScheduler } from "./services/scheduler.js";
import { seatEvents } from "./utils/events.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/venues", venueRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/events", holdRoutes);
app.use("/api/events", eventWaitlistRouter);
app.use("/api/bookings", bookingRoutes);
app.use("/api/waitlist", waitlistRoutes);
app.use("/api/organiser", organiserRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" },
});

io.on("connection", (socket) => {
  socket.on("subscribe", (eventId) => {
    socket.join(`event:${eventId}`);
  });
  socket.on("unsubscribe", (eventId) => {
    socket.leave(`event:${eventId}`);
  });
});

// Business-logic services emit here (see utils/events.js); we fan them out
// to every client watching that event's seat map / waitlist in real time.
seatEvents.on("seat:update", ({ eventId, seat }) => {
  io.to(`event:${eventId}`).emit("seat:update", seat);
});
seatEvents.on("waitlist:update", ({ eventId, waitlistEntry }) => {
  io.to(`event:${eventId}`).emit("waitlist:update", waitlistEntry);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Ticket Booking API listening on http://localhost:${PORT}`);
  startScheduler();
});

export default app;
