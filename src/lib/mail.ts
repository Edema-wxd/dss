import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import nodemailer from "nodemailer";
import { checklistPdf } from "./checklist";
import { logMail, setLeadFlag } from "./desk/db";

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

const CHECKLIST_SUBJECT = "Your Launch Visibility Checklist";

/** Sends the checklist and returns the mail server's message ID. */
export async function sendChecklistNow({ name, email, site }: { name: string; email: string; site: string }) {
  const firstName = name.split(/\s+/)[0] ?? "";
  const attachment = await pdfAttachment();
  const info = await transport().sendMail({
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to: email,
    subject: CHECKLIST_SUBJECT,
    text: checklistEmail(firstName, site),
    attachments: attachment ? [attachment] : [],
  });
  return info.messageId ?? "";
}

type ChecklistLead = { leadId: number | null; name: string; email: string; site: string };

/**
 * Sends the checklist and records the outcome in the desk's sent-mail log, ticking the
 * lead's "Email 1 sent" on success. Never throws: a failure is logged, not raised.
 */
export async function deliverChecklist(lead: ChecklistLead) {
  const entry = { kind: "checklist", to: lead.email, subject: CHECKLIST_SUBJECT, leadId: lead.leadId };
  if (!mailConfigured()) {
    await logMail({ ...entry, status: "skipped", detail: "Email isn't set up on this server (the SMTP settings are missing)." });
    return false;
  }
  try {
    const messageId = await sendChecklistNow(lead);
    await logMail({ ...entry, status: "sent", detail: messageId });
    if (lead.leadId) await setLeadFlag(lead.leadId, "email1", true);
    return true;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Checklist email failed:", detail);
    await logMail({ ...entry, status: "failed", detail }).catch((logError) => console.error("Couldn't log the failed email:", logError));
    return false;
  }
}

/** Queues the checklist email to send after the response, so the visitor never waits on the mail server. */
export function scheduleChecklistEmail(lead: ChecklistLead) {
  after(() => deliverChecklist(lead).then(() => undefined));
}
