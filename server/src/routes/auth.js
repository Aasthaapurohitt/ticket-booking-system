import { Router } from "express";
import db from "../db/db.js";
import { id as newId } from "../utils/ids.js";
import { hashPassword, verifyPassword, signToken } from "../utils/auth.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const VALID_ROLES = ["customer", "organiser", "admin"];

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) throw new ApiError(400, "name, email and password are required");
    const finalRole = VALID_ROLES.includes(role) ? role : "customer";

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) throw new ApiError(409, "An account with this email already exists");

    const user = {
      id: newId(),
      name,
      email: email.toLowerCase(),
      password_hash: hashPassword(password),
      role: finalRole,
    };
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, user.name, user.email, user.password_hash, user.role);

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "email and password are required");

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, "Invalid email or password");
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
