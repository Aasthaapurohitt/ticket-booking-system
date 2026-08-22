import nodemailer from "nodemailer";

let transporterPromise = null;

/**
 * Resolves a nodemailer transporter.
 *
 * - If SMTP_HOST/SMTP_USER/SMTP_PASS are set in the environment, real email
 *   is sent through that provider (any free-tier SMTP works: Gmail app
 *   password, SendGrid, Mailtrap, Brevo, etc).
 * - Otherwise we fall back to an Ethereal test account (auto-created,
 *   nothing to configure) so the full flow is demonstrable out of the box.
 *   Ethereal doesn't deliver real mail -- it gives back a preview URL that
 *   is logged to the server console instead.
 */
function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    );
  } else {
    transporterPromise = nodemailer.createTestAccount().then((account) =>
      nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: account.user, pass: account.pass },
      })
    );
  }
  return transporterPromise;
}

export async function sendMail({ to, subject, html, attachments }) {
  const transporter = await getTransporter();
  const from = process.env.MAIL_FROM || '"Ticket Booking" <noreply@ticketbooking.dev>';
  const info = await transporter.sendMail({ from, to, subject, html, attachments });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    // Dev fallback: no real inbox, so print a viewable preview link instead.
    console.log(`[email] "${subject}" to ${to} -> preview: ${previewUrl}`);
  } else {
    console.log(`[email] "${subject}" sent to ${to}`);
  }
  return { messageId: info.messageId, previewUrl };
}

export function bookingConfirmationEmail({ user, event, seats, bookingRef, qrDataUrl, totalAmount }) {
  const seatList = seats.map((s) => `<li>${s.label} — ${s.category} — ₹${s.price}</li>`).join("");
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      <h2>Booking Confirmed 🎟️</h2>
      <p>Hi ${user.name},</p>
      <p>Your booking for <strong>${event.title}</strong> is confirmed.</p>
      <p><strong>Booking Reference:</strong> ${bookingRef}<br/>
         <strong>Date/Time:</strong> ${event.date_time}<br/>
         <strong>Total:</strong> ₹${totalAmount}</p>
      <p><strong>Seats:</strong></p>
      <ul>${seatList}</ul>
      <p>Show this QR code at the venue entrance:</p>
      <img src="${qrDataUrl}" alt="Booking QR code" width="200" height="200" />
      <p style="color:#888; font-size:12px;">This is an automated message from Ticket Booking System.</p>
    </div>
  `;
  return {
    subject: `Booking Confirmed: ${event.title} (${bookingRef})`,
    html,
  };
}

export function waitlistOfferEmail({ user, event, seat, offerExpiresAt, offerUrl }) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      <h2>A seat opened up! 🎉</h2>
      <p>Hi ${user.name},</p>
      <p>A <strong>${seat.category}</strong> seat for <strong>${event.title}</strong> is now available
      because another customer cancelled their booking.</p>
      <p>You have until <strong>${offerExpiresAt}</strong> to complete your booking, after which
      it will be offered to the next person on the waitlist.</p>
      <p><a href="${offerUrl}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Complete your booking</a></p>
      <p style="color:#888; font-size:12px;">This is an automated message from Ticket Booking System.</p>
    </div>
  `;
  return {
    subject: `Seat available for ${event.title} — act fast!`,
    html,
  };
}
