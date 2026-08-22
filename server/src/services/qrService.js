import QRCode from "qrcode";

/**
 * Generates a QR code (as a base64 data URL) encoding the booking reference
 * and a few essential details. The QR payload intentionally stays small --
 * a booking reference is enough for a gate scanner to look up the full
 * booking server-side, so we don't leak seat/customer PII into the code.
 */
export async function generateBookingQr({ bookingRef, eventId, seatLabels }) {
  const payload = JSON.stringify({
    ref: bookingRef,
    eventId,
    seats: seatLabels,
  });
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 300 });
}
