import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "PharmaShift <no-reply@example.com>";
const BASE = process.env.AUTH_URL ?? "http://localhost:3000";

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    // Dev-Fallback: in Konsole loggen statt zu versenden
    console.log(`\n[EMAIL:DEV] An: ${to}\nBetreff: ${subject}\n${html}\n`);
    return;
  }
  await resend.emails.send({ from: FROM, to, subject, html });
}

const wrap = (title: string, body: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px">
    <h1 style="font-size:20px">${title}</h1>
    ${body}
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee"/>
    <p style="color:#888;font-size:12px">PharmaShift — automatische Nachricht</p>
  </div>`;

export async function sendVerificationEmail(to: string, token: string) {
  const url = `${BASE}/verify?token=${token}`;
  await send(
    to,
    "Bestätige deine E-Mail-Adresse",
    wrap(
      "E-Mail bestätigen",
      `<p>Bitte bestätige deine E-Mail-Adresse:</p>
       <p><a href="${url}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">E-Mail bestätigen</a></p>`,
    ),
  );
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${BASE}/reset?token=${token}`;
  await send(
    to,
    "Passwort zurücksetzen",
    wrap(
      "Passwort zurücksetzen",
      `<p>Du hast ein neues Passwort angefordert:</p>
       <p><a href="${url}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Neues Passwort setzen</a></p>
       <p style="color:#888;font-size:12px">Falls du das nicht warst, ignoriere diese Mail.</p>`,
    ),
  );
}

export async function sendInvitationEmail(to: string, orgName: string, token: string) {
  const url = `${BASE}/register?invite=${token}`;
  await send(
    to,
    `Einladung zu ${orgName} auf PharmaShift`,
    wrap(
      "Du wurdest eingeladen",
      `<p>Du wurdest zu <strong>${orgName}</strong> eingeladen.</p>
       <p><a href="${url}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Einladung annehmen</a></p>`,
    ),
  );
}

export interface PublishedShiftLine { date: string; startTime: string; endTime: string; locationName: string; }

export async function sendPlanPublishedEmail(
  to: string,
  name: string,
  weekLabel: string,
  shifts: PublishedShiftLine[],
) {
  const rows = shifts
    .map(
      (s) =>
        `<tr><td style="padding:6px 12px 6px 0">${s.date}</td>` +
        `<td style="padding:6px 12px 6px 0">${s.startTime}–${s.endTime}</td>` +
        `<td style="padding:6px 0">${s.locationName}</td></tr>`,
    )
    .join("");
  await send(
    to,
    `Dein Dienstplan für ${weekLabel}`,
    wrap(
      "Dienstplan veröffentlicht",
      `<p>Hallo ${name},</p>
       <p>der Dienstplan für <strong>${weekLabel}</strong> wurde veröffentlicht. Deine Schichten:</p>
       <table style="border-collapse:collapse;font-size:14px">${rows || "<tr><td>Keine Schichten.</td></tr>"}</table>`,
    ),
  );
}

export async function sendInsightsDigestEmail(
  to: string,
  orgName: string,
  insights: { severity: "warn" | "info"; message: string; href: string }[],
) {
  if (insights.length === 0) return;
  const rows = insights
    .map((i) => `<li style="margin:6px 0;color:${i.severity === "warn" ? "#b04242" : "#555"}">${i.message}</li>`)
    .join("");
  const body = `
    <p>Guten Morgen! Übersicht für <strong>${orgName}</strong>:</p>
    <ul style="padding-left:18px">${rows}</ul>
    <p style="margin-top:20px"><a href="${BASE}/admin/dashboard" style="color:#2f7d52">Zum Dashboard →</a></p>`;
  await send(to, `PharmaShift — Tagesübersicht (${insights.length} Hinweis${insights.length === 1 ? "" : "e"})`, wrap("Tägliche Übersicht", body));
}
