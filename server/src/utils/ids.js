import { v4 as uuidv4 } from "uuid";

export function id() {
  return uuidv4();
}

// Human friendly booking reference, e.g. TB-7F3K9Q2A
export function bookingRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TB-${out}`;
}
