/**
 * Stepin2Green backend — Cloudflare Worker
 *
 * Replaces the old Express + mysql2 server that ran on Railway.
 * Database:  TiDB Cloud Starter (MySQL-compatible, free forever)
 * Email:     Brevo transactional email HTTP API
 *
 * Secrets (set with `npx wrangler secret put <NAME>`):
 *   DATABASE_URL    mysql://user:password@host/database
 *   BREVO_API_KEY   xkeysib-...
 *   ADMIN_PASSWORD  password for the /admin page and GET /api/volunteers
 *
 * Plain vars (in wrangler.toml):
 *   ALLOWED_ORIGINS      comma-separated list of allowed website origins
 *   BREVO_SENDER_EMAIL   verified sender address in Brevo
 *   BREVO_SENDER_NAME    display name on the email
 */

import { connect } from '@tidbcloud/serverless';

// ============================================
// 🔧 SMALL HELPERS
// ============================================

/** Escape text before putting it inside HTML. Stops a submitted name
 *  containing <script> from running on the admin page. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // If no list is configured, fall back to allowing everything (same as the
  // old `app.use(cors())`). Once ALLOWED_ORIGINS is set, only those match.
  const allowOrigin =
    allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, request, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Constant-time-ish string compare, so the password can't be guessed by timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HTTP Basic auth. Username is ignored, only the password matters. */
function isAuthorised(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(password, env.ADMIN_PASSWORD);
}

function unauthorised() {
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Stepin2Green admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

/** Rows are stored in UTC; show them in Malaysian time. */
function formatKL(raw) {
  if (!raw) return '-';
  // The driver hands back "2026-09-01 12:34:56" with no zone marker.
  const iso =
    raw instanceof Date
      ? raw.toISOString()
      : String(raw).replace(' ', 'T').replace(/Z?$/, 'Z');
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(raw);
  return d.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function db(env) {
  return connect({ url: env.DATABASE_URL });
}

// ============================================
// 📧 EMAIL — BREVO HTTP API
// ============================================

function confirmationHtml(fullName, team, instagram) {
  const name = esc(fullName);
  const teamName = esc(team);
  const ig = esc(instagram);
  return `<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #0a1a17; color: #e2f0e9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a1a17; padding: 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #0b1f1c; border-radius: 20px; border: 1px solid rgba(86, 204, 151, 0.15); padding: 30px;">
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <h1 style="color: #8ce0c0; font-size: 2rem; margin: 0; font-weight: 700;">🌱 Stepin2Green</h1>
              <p style="color: #6a8f82; margin: 5px 0 0; font-size: 0.9rem;">science · art · community</p>
            </td>
          </tr>
          <tr>
            <td>
              <h2 style="color: #c6f0df; font-weight: 600; margin: 10px 0 15px;">Hi ${name},</h2>
              <p style="line-height: 1.7; font-size: 1rem; color: #e2f0e9;">Thank you for applying to join <strong style="color: #8ce0c0;">Stepin2Green</strong>!</p>
              <p style="line-height: 1.7; font-size: 1rem; color: #e2f0e9;">We have received your application for the <strong style="color: #8ce0c0;">${teamName}</strong> team.</p>
              <p style="line-height: 1.7; font-size: 1rem; color: #e2f0e9;">We'll reach out to you on Instagram at <strong style="color: #8ce0c0;">${ig}</strong> for next steps.</p>

              <div style="background: rgba(59, 186, 140, 0.08); border-left: 4px solid #3bba8c; padding: 15px 20px; border-radius: 12px; margin: 20px 0;">
                <p style="margin: 0; color: #c6f0df; font-size: 0.95rem;">
                  📧 We will get back to you shortly with our decision.
                  <span style="display: block; margin-top: 6px; color: #6a8f82; font-size: 0.85rem;">
                    Keep an eye on your inbox and Instagram DMs!
                  </span>
                </p>
              </div>

              <hr style="border: none; border-top: 1px solid rgba(86, 204, 151, 0.15); margin: 25px 0 15px;">

              <p style="color: #8ce0c0; font-size: 1rem; margin: 0;">🌱 Together let's learn, create, and inspire!</p>
              <p style="color: #6a8f82; font-size: 0.9rem; margin: 5px 0 0;">— Stepin2Green Team</p>
              <p style="color: #4a6f62; font-size: 0.75rem; margin-top: 15px; border-top: 1px solid rgba(86, 204, 151, 0.05); padding-top: 15px;">
                This is an automated confirmation email. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendConfirmationEmail(env, fullName, email, team, instagram) {
  if (!env.BREVO_API_KEY) {
    console.error('❌ BREVO_API_KEY is not set — skipping email');
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: env.BREVO_SENDER_NAME || 'Stepin2Green',
          email: env.BREVO_SENDER_EMAIL || 'stepin2green2@gmail.com',
        },
        to: [{ email, name: fullName }],
        subject: `🌱 Welcome to Stepin2Green - ${fullName}`,
        htmlContent: confirmationHtml(fullName, team, instagram),
      }),
    });

    if (!res.ok) {
      console.error('❌ Brevo error:', res.status, await res.text());
      return false;
    }
    console.log(`✅ Email sent to ${email}`);
    return true;
  } catch (err) {
    console.error('❌ Email error:', err.message);
    return false;
  }
}

// ============================================
// 📋 ROUTE HANDLERS
// ============================================

async function handleRoot(request, env) {
  return json(
    {
      message: 'Stepin2Green API',
      status: 'running',
      endpoints: [
        'GET /api/volunteers - View all applications (password protected)',
        'POST /api/volunteers - Submit application',
        'GET /admin - Admin dashboard (password protected)',
      ],
    },
    request,
    env
  );
}

async function handleListVolunteers(request, env) {
  if (!isAuthorised(request, env)) return unauthorised();
  try {
    const conn = db(env);
    const rows = await conn.execute(
      'SELECT * FROM volunteers ORDER BY submitted_at DESC'
    );
    return json(rows, request, env);
  } catch (err) {
    console.error('Query error:', err);
    return json({ error: err.message }, request, env, 500);
  }
}

async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, request, env, 400);
  }

  const trim = (v, max) =>
    typeof v === 'string' ? v.trim().slice(0, max) : null;

  const fullName = trim(body.fullName, 120);
  const email = trim(body.email, 200);
  const instagram = trim(body.instagram, 120);
  const background = trim(body.background, 400);
  const team = trim(body.team, 60) || 'Not specified';
  const message = trim(body.message, 4000);

  if (!fullName || !email || !instagram) {
    return json(
      { error: 'Name, email and Instagram handle are required' },
      request,
      env,
      400
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email address' }, request, env, 400);
  }

  let insertId = null;
  try {
    const conn = db(env);

    // Guard against double-submits. Six of the rows migrated from Railway were
    // the same person hitting send two to four times within ~90 seconds, so
    // treat an identical email inside a 5-minute window as the same application.
    const recent = await conn.execute(
      `SELECT id FROM volunteers
        WHERE email = ?
          AND submitted_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
        LIMIT 1`,
      [email]
    );
    if (Array.isArray(recent) && recent.length > 0) {
      console.log(`↩️  Duplicate submit ignored for ${email}`);
      return json(
        {
          success: true,
          duplicate: true,
          id: recent[0].id,
          emailSent: false,
          message: 'We already have your application — thanks, no need to send it twice!',
        },
        request,
        env
      );
    }

    const result = await conn.execute(
      `INSERT INTO volunteers (full_name, email, instagram, background, team, message, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [fullName, email, instagram, background, team, message],
      { fullResult: true }
    );
    insertId =
      result && (result.lastInsertId ?? result.insertId ?? null);
    console.log(`✅ Application saved for ${fullName} (ID: ${insertId})`);
  } catch (err) {
    console.error('Insert error:', err);
    return json({ error: err.message }, request, env, 500);
  }

  let emailSent = false;
  try {
    emailSent = await sendConfirmationEmail(env, fullName, email, team, instagram);
  } catch (err) {
    console.error('Email error:', err);
  }

  return json(
    {
      success: true,
      id: insertId,
      emailSent,
      message: emailSent
        ? 'Application submitted! A confirmation email has been sent.'
        : 'Application submitted! (Email notification pending)',
    },
    request,
    env
  );
}

async function handleAdmin(request, env) {
  if (!isAuthorised(request, env)) return unauthorised();

  let results;
  try {
    const conn = db(env);
    results = await conn.execute(
      'SELECT * FROM volunteers ORDER BY submitted_at DESC'
    );
  } catch (err) {
    console.error('Admin page error:', err);
    return html(
      `<!DOCTYPE html><html><head><title>Database Error</title></head>
       <body style="font-family: sans-serif; padding: 2rem; background: #0b1f1c; color: #e2f0e9;">
         <h1>⚠️ Database Error</h1>
         <p>Error: ${esc(err.message)}</p>
         <p>Check the Worker logs with <code>npx wrangler tail</code>.</p>
       </body></html>`,
      500
    );
  }

  const rows = results
    .map(
      (row) => `
        <tr>
          <td class="col-id">${esc(row.id)}</td>
          <td class="col-name"><strong>${esc(row.full_name)}</strong></td>
          <td class="col-email"><a href="mailto:${esc(row.email)}" style="color: #6cd4b0;">${esc(row.email)}</a></td>
          <td class="col-instagram"><span class="instagram-handle">📷 ${esc(row.instagram) || '-'}</span></td>
          <td class="col-team"><span class="badge">${esc(row.team)}</span></td>
          <td class="col-background">${esc(row.background) || '-'}</td>
          <td class="col-message message-cell">
            <span class="label">📝 Message:</span>
            <span class="full-text">${esc(row.message) || '-'}</span>
          </td>
          <td class="col-submitted">${formatKL(row.submitted_at)}</td>
        </tr>`
    )
    .join('');

  return html(`<!DOCTYPE html>
<html>
<head>
  <title>Stepin2Green - Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0b1f1c; color: #e2f0e9; padding: 1rem; margin: 0; }
    .container { max-width: 1300px; margin: 0 auto; }
    h1 { color: #8ce0c0; }
    .stats { background: rgba(23,52,46,0.6); padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem;
             display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.8rem; }
    .stats a { color:#8ce0c0; font-size:0.85rem; }
    .table-wrapper { overflow-x: auto; background: rgba(23,52,46,0.6); border-radius: 12px; padding: 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed; }
    th, td { padding: 10px 6px; text-align: left; border-bottom: 1px solid #2d5a4f;
             word-wrap: break-word; word-break: break-word; }
    th { background: #1a3d35; color: #8ce0c0; position: sticky; top: 0; }
    tr:hover { background: rgba(59,186,140,0.08); }
    .badge { display: inline-block; background: rgba(59,186,140,0.2); padding: 2px 10px;
             border-radius: 20px; font-size: 0.7rem; }
    .col-id { width: 45px; } .col-name { width: 110px; } .col-email { width: 160px; }
    .col-instagram { width: 110px; } .col-team { width: 85px; } .col-background { width: 110px; }
    .col-message { width: 200px; } .col-submitted { width: 130px; }
    .message-cell { max-width: 200px; white-space: normal; line-height: 1.4; }
    .message-cell .full-text { display: block; font-size: 0.8rem; color: #c6f0df; }
    .message-cell .label { color: #6a8f82; font-size: 0.65rem; display: block; margin-bottom: 2px; }
    .instagram-handle { color: #e67e22; font-weight: 500; }
    @media (max-width: 600px) {
      th, td { padding: 6px 3px; font-size: 0.7rem; }
      .col-id { width: 30px; } .col-name { width: 70px; } .col-email { width: 80px; }
      .col-instagram { width: 70px; } .col-message { width: 100px; } .col-submitted { width: 80px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🌱 Volunteer Applications</h1>
    <div class="stats">
      <span>Total: ${results.length} submissions</span>
      <a href="/admin/export.csv">⬇ Download CSV</a>
    </div>
    <div class="table-wrapper">
      <table>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-name">Name</th>
          <th class="col-email">Email</th>
          <th class="col-instagram">Instagram</th>
          <th class="col-team">Team</th>
          <th class="col-background">Background</th>
          <th class="col-message">Message</th>
          <th class="col-submitted">Submitted</th>
        </tr>
        ${rows}
      </table>
    </div>
  </div>
</body>
</html>`);
}

async function handleExport(request, env) {
  if (!isAuthorised(request, env)) return unauthorised();
  try {
    const conn = db(env);
    const results = await conn.execute(
      'SELECT id, full_name, email, instagram, background, team, message, submitted_at FROM volunteers ORDER BY submitted_at DESC'
    );
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header =
      'id,full_name,email,instagram,background,team,message,submitted_at\n';
    const body = results
      .map((r) =>
        [
          r.id,
          r.full_name,
          r.email,
          r.instagram,
          r.background,
          r.team,
          r.message,
          formatKL(r.submitted_at),
        ]
          .map(cell)
          .join(',')
      )
      .join('\n');
    return new Response('﻿' + header + body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="stepin2green-volunteers.csv"',
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${err.message}`, { status: 500 });
  }
}

// ============================================
// 🚀 WORKER ENTRY POINT
// ============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === '/' && request.method === 'GET') return handleRoot(request, env);
    if (path === '/api/volunteers' && request.method === 'GET')
      return handleListVolunteers(request, env);
    if (path === '/api/volunteers' && request.method === 'POST')
      return handleSubmit(request, env);
    if (path === '/admin' && request.method === 'GET') return handleAdmin(request, env);
    if (path === '/admin/export.csv' && request.method === 'GET')
      return handleExport(request, env);

    return json({ error: 'Not found' }, request, env, 404);
  },
};
