import { EventEmitter } from "events";

// Decouples business logic (holds/bookings/waitlist) from the socket layer.
// Services emit seat/waitlist changes here; index.js subscribes and
// broadcasts them to clients subscribed to that event's room.
export const seatEvents = new EventEmitter();

export function emitSeatUpdate(eventId, seat) {
  seatEvents.emit("seat:update", { eventId, seat });
}

export function emitWaitlistUpdate(eventId, waitlistEntry) {
  seatEvents.emit("waitlist:update", { eventId, waitlistEntry });
}
