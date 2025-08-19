import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../utils/db.js";
import { sendWelcomeEmail, sendResetEmail } from "../utils/mail.js";

const router = Router();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "david_010@live.com.mx";

function setSessionAndGo(
  req,
  res,
  uid,
  email,
  nextUrl = "/panel",
  isAdmin = false
) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).send("Session error");
    req.session.uid = uid;
    req.session.email = email;
    req.session.is_admin = isAdmin;
    req.session.save(() => res.redirect(nextUrl));
  });
}

router.get("/login", (req, res) =>
  res.render("site/login", { next: req.query.next || "/panel", error: null })
);

router.get("/register", (req, res) => {
  res.render("site/register", { title: "Crear cuenta", error: null });
});

router.post("/register", async (req, res) => {
  try {
    const { name = "", email = "", password = "" } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .render("site/register", {
          error: "Faltan datos",
          title: "Crear cuenta",
        });

    const [[exists]] = await pool.query(
      "SELECT id FROM users WHERE email=? LIMIT 1",
      [email]
    );
    if (exists)
      return res
        .status(409)
        .render("site/register", {
          error: "Este correo ya está registrado",
          title: "Crear cuenta",
        });

    const hash = await bcrypt.hash(password, 10);
    const [ins] = await pool.query(
      "INSERT INTO users (name, email, password_hash, is_admin) VALUES (?,?,?,?)",
      [
        name.trim(),
        email.trim().toLowerCase(),
        hash,
        email.trim().toLowerCase() === ADMIN_EMAIL ? 1 : 0,
      ]
    );

const base = `${req.protocol}://${req.get("host")}`;
    sendWelcomeEmail(email, {
      name: name.trim() || "Usuario",
      loginUrl: `${base}/auth/login`,
    }).catch((e) => console.error("send welcome email", e));

    req.session.uid = ins.insertId;
    // trae el usuario para locals y flag de admin
    const [[u]] = await pool.query(
      "SELECT id, email, name, is_admin FROM users WHERE id=?",
      [ins.insertId]
    );
    req.session.is_admin = !!u?.is_admin;
    return res.redirect(u.is_admin ? "/admin" : "/panel");
  } catch (e) {
    console.error("POST /auth/register", e);
    res
      .status(500)
      .render("site/register", {
        error: "Error registrando usuario",
        title: "Crear cuenta",
      });
  }
});

router.get("/forgot", (req, res) => {
  res.render("site/forgot", {
    title: "Recuperar contraseña",
    error: null,
    ok: null,
  });
});

router.post("/forgot", async (req, res) => {
  const { email = "" } = req.body;
  if (!email)
    return res.render("site/forgot", {
      title: "Recuperar contraseña",
      error: "Email requerido",
      ok: null,
    });
  const [[user]] = await pool.query(
    "SELECT id, email, name FROM users WHERE email=? LIMIT 1",
    [email]
  );
  if (!user)
    return res.render("site/forgot", {
      title: "Recuperar contraseña",
      error: "No existe usuario con ese email",
      ok: null,
    });
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60);
  await pool.query(
    "INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)",
    [user.id, token, expires]
  );
  const base = `${req.protocol}://${req.get("host")}`;
  const link = `${base}/auth/reset/${token}`;
sendResetEmail(user.email, {
    name: user.name || "Usuario",
    link,
  }).catch((e) => console.error("send reset email", e));
  res.render("site/forgot", {
    title: "Recuperar contraseña",
    error: null,
    ok: "Revisa tu email para continuar",
  });
});

router.get("/reset/:token", async (req, res) => {
  const [[row]] = await pool.query(
    "SELECT user_id FROM password_resets WHERE token=? AND expires_at>NOW()",
    [req.params.token]
  );
  if (!row)
    return res.render("site/reset", {
      title: "Restablecer contraseña",
      error: "Token inválido",
      token: null,
    });
  res.render("site/reset", {
    title: "Restablecer contraseña",
    error: null,
    token: req.params.token,
  });
});

router.post("/reset/:token", async (req, res) => {
  const { password = "" } = req.body;
  const [[row]] = await pool.query(
    "SELECT user_id FROM password_resets WHERE token=? AND expires_at>NOW()",
    [req.params.token]
  );
  if (!row)
    return res.status(400).render("site/reset", {
      title: "Restablecer contraseña",
      error: "Token inválido",
      token: null,
    });
  const hash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password_hash=? WHERE id=?", [
    hash,
    row.user_id,
  ]);
  await pool.query("DELETE FROM password_resets WHERE token=?", [
    req.params.token,
  ]);
  res.redirect("/auth/login");
});


router.post("/login", async (req, res) => {
  const { email, password, next } = req.body;
  const [rows] = await req.db.query("SELECT * FROM users WHERE email=?", [
    email,
  ]);

  const destNext = next || "/panel";
  if (!rows.length)
    return res
      .status(401)
      .render("site/login", {
        error: "Credenciales inválidas",
        next: destNext,
      });
  const ok = await bcrypt.compare(password, rows[0].password_hash);

  if (!ok)
    return res
      .status(401)
      .render("site/login", {
        error: "Credenciales inválidas",
        next: destNext,
      });
  const isAdmin = rows[0].is_admin || rows[0].email === ADMIN_EMAIL;
  const dest = isAdmin ? "/admin/templates" : destNext;
  setSessionAndGo(req, res, rows[0].id, rows[0].email, dest, !!isAdmin);
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("logout err:", err);
    // El nombre por defecto de la cookie de sesión es 'connect.sid'
    res.clearCookie(process.env.SESSION_NAME || "connect.sid", { path: "/" });
    return res.redirect("/");
  });
});

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("logout err:", err);
    res.clearCookie(process.env.SESSION_NAME || "connect.sid", { path: "/" });
    return res.redirect("/");
  });
});

export default router;
