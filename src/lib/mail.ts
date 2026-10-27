import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import nodemailer from "nodemailer";
import { checklistPdf } from "./checklist";

// Emails the Launch Visibility Checklist to everyone who asks for it on the site,
// sent from the studio's MangoMail mailbox over SMTP.
//
// Needs the mailbox's SMTP login:
//   SMTP_HOST, SMTP_USER and SMTP_PASS, and optionally SMTP_PORT (465 by default)
//   and MAIL_FROM (the display name and address the email comes from).
//   SITE_URL sets the links in the email; it falls back to the address the form was sent to.

const DEFAULT_FROM = "Janefrances at Digital Savvy Studios <hello@digitalsavvystudios.com>";

export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function transport() {
  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 speaks TLS from the start; 587 upgrades with STARTTLS
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** The PDF from /public, or null where the host doesn't ship /public with the server. */
async function pdfAttachment() {
  try {
    const content = await readFile(path.join(process.cwd(), "public", checklistPdf));
    return { filename: path.basename(checklistPdf), content, contentType: "application/pdf" };
  } catch {
    return null;
  }
}

function checklistEmail(firstName: string, site: string) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  return `${greeting}

Here's The Launch Visibility Checklist: 12 checks across 15 pages, attached as a PDF. You can also download it here:
${site}${checklistPdf}

Start with the first one: can you say who you're for and why you win in one sentence, and would your team say it the same way?

If you'd rather have us run all 12 for you before your next big moment, the Visibility Session is a ₦250,000 review, complimentary by application:
${site}/#apply

Janefrances C. Obiajulu
Founder and Creative Director, Digital Savvy Studios

You're getting this because you asked for the checklist on our website. Reply "unsubscribe" and we won't email you again.`;
}

export async function sendChecklistNow({ name, email, site }: { name: string; email: string; site: string }) {
  const firstName = name.split(/\s+/)[0] ?? "";
  const attachment = await pdfAttachment();
  await transport().sendMail({
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to: email,
    subject: "Your Launch Visibility Checklist",
    text: checklistEmail(firstName, site),
    attachments: attachment ? [attachment] : [],
  });
}

/** Queues the checklist email to send after the response. Does nothing until SMTP is set up. */
export function scheduleChecklistEmail(lead: { name: string; email: string; site: string }) {
  if (!mailConfigured()) return;
  after(() =>
    sendChecklistNow(lead).catch((e) => console.error("Checklist email failed:", e instanceof Error ? e.message : e)),
  );
}
