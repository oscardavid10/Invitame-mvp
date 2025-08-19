import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMAILS_DIR = path.join(__dirname, "..", "views", "emails");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

export function sendMail(to, subject, html, attachments = []) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return transporter.sendMail({ from, to, subject, html, attachments });
}

async function renderTemplate(name, data = {}) {
  const file = path.join(EMAILS_DIR, `${name}.ejs`);
  return ejs.renderFile(file, data, { async: true });
}

export async function sendTemplateMail(to, subject, template, data = {}, attachments = []) {
  const html = await renderTemplate(template, data);
  return sendMail(to, subject, html, attachments);
}

export function sendWelcomeEmail(to, data) {
  return sendTemplateMail(to, "Bienvenido a Invitame", "welcome", data);
}

export function sendResetEmail(to, data) {
  return sendTemplateMail(to, "Recuperar contraseña", "reset", data);
}

export function sendReceiptEmail(to, data, attachments = []) {
  return sendTemplateMail(to, "Comprobante de pago", "receipt", data, attachments);
}