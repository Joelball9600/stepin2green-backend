# Stepin2Green — moving off Railway

**New stack (all permanently free, no credit card):**

| Piece | Was | Now | Free limits |
|---|---|---|---|
| Database | Railway MySQL | **TiDB Cloud Starter** (MySQL-compatible) | 5 GiB storage + 50M request units/month |
| Backend | Railway (Express) | **Cloudflare Worker** | 100,000 requests/day, never sleeps |
| Website | Cloudflare Pages | unchanged | unlimited requests |
| Email | Brevo SMTP | **Brevo HTTP API** | 300 emails/day |

Nothing here has a trial clock. Your form gets maybe a handful of submissions a
day — you are using well under 1% of every one of those limits.

---

## Part 1 — Create the free database

1. Go to <https://tidbcloud.com> and sign up (Google sign-in works, no card).
2. **Create Cluster** → choose the **Starter** plan (the free one) → region
   **Singapore (ap-southeast-1)** — that's the closest to Malaysia.
3. When it's ready (~30 seconds), click **Connect**.
   - Click **Generate Password** and **save it somewhere safe** — TiDB only
     shows it once.
   - Note down the **host** (looks like
     `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`) and the **user**
     (looks like `3xAbCdEfGhIj.root`).
4. Open **SQL Editor** in the left sidebar.

   ⚠️ **The SQL Editor runs the statement your cursor is in, not the whole
   file.** Paste one statement, click inside it, press **Run**, then move on to
   the next. Pasting several at once and hitting Run only executes one of them —
   which shows up as "Unknown database 'stepin2green'" when the `CREATE
   DATABASE` silently never ran.

5. Run this on its own first:

   ```sql
   CREATE DATABASE stepin2green;
   ```

   Then click the ↻ refresh icon above the **Schemas** list — `stepin2green`
   should now appear next to `sys` and `test`.

6. Now run `migrate/00-schema.sql`:

   ```sql
   CREATE TABLE IF NOT EXISTS stepin2green.volunteers (
     id           INT AUTO_INCREMENT PRIMARY KEY,
     full_name    VARCHAR(255) NOT NULL,
     email        VARCHAR(255) NOT NULL,
     instagram    VARCHAR(255) DEFAULT NULL,
     background   VARCHAR(500) DEFAULT NULL,
     team         VARCHAR(100) DEFAULT NULL,
     message      TEXT         DEFAULT NULL,
     submitted_at DATETIME     NOT NULL,
     INDEX idx_submitted_at (submitted_at)
   );
   ```

   Every table name in the migration files is written out in full as
   `stepin2green.volunteers`, and there are no `USE` statements — a `USE`
   doesn't carry over between runs in the web editor, so qualifying the name is
   what makes these files safe to run in any order.

7. Build your connection string — you'll need it in Part 4:

   ```
   mysql://USER:PASSWORD@HOST/stepin2green
   ```

   e.g. `mysql://3xAbCdEfGhIj.root:MyPa55word@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/stepin2green`

   ⚠️ If your password contains `@ : / ? # &`, percent-encode it
   (`@` → `%40`, `#` → `%23`, and so on) or the URL will be parsed wrongly.
   Easiest fix: regenerate a password with letters and numbers only.

---

## Part 2 — Import your existing volunteer data

Already done for you. Your 28 rows are in `migrate/01-volunteers-import.sql`,
converted from the JSON export and verified row-by-row against the original —
apostrophes, emoji, curly quotes, em dashes and NULLs all survive intact.

Run these in the TiDB **SQL Editor**, in order — remembering that it executes
the statement your cursor is in, so click into each one and press Run
separately:

| File | What it does |
|---|---|
| `migrate/00-schema.sql` | creates the `volunteers` table |
| `migrate/01-volunteers-import.sql` | inserts all 28 rows, keeping their original ids, and sets `AUTO_INCREMENT` to 35 so new submissions carry on from where Railway left off |
| `migrate/02-cleanup-optional.sql` | optional — read the comments first |

Then confirm:

```sql
SELECT COUNT(*) FROM stepin2green.volunteers;   -- 28
```

### About the duplicates

Ten of those 28 rows are accidental double-submits — six people pressed send
between two and four times, all within about 90 seconds:

| Who | ids | |
|---|---|---|
| Rowan Naththarampatha | 31, 32, 33 | 3× in 83s |
| Hannah Clark | 21, 22, 23 | 3× in 93s |
| 🤫 | 27, 28, 29, 30 | 4× in 88s |
| Keshav Karthik | 24, 25 | 2× in 32s |
| "a" | 8, 9 | 2× in 1s |
| Joel (your test row) | 11, 13 | |

`02-cleanup-optional.sql` removes them, keeping the earliest of each set — 18
rows left. It also lists your test rows and the joke entries separately, each
one commented out with a note on what it contains, so you decide rather than me.

The new backend won't let this happen again: a second submission from the same
email address within five minutes is answered with "we already have your
application" instead of being written to the database, so nobody gets a
duplicate confirmation email either.

---

## Part 3 — Get a Brevo API key

The Worker can't speak SMTP (Cloudflare blocks raw TCP mail ports), so it uses
Brevo's HTTP API instead. Same account, same free 300 emails/day — just a
different credential.

1. Brevo → **SMTP & API** → **API Keys** tab → **Generate a new API key**.
2. Copy it (starts with `xkeysib-`). This is *not* the same as your SMTP
   password.
3. Brevo → **Senders, Domains & Dedicated IPs** → make sure
   `stepin2green2@gmail.com` is listed and **verified**. If it isn't, add it and
   click the confirmation link Brevo emails you — otherwise every send fails.

---

## Part 4 — Deploy the Worker

Replace everything in your `stepin2green-backend` repo with the new files:

```
stepin2green-backend/
├── src/index.js          ← the whole backend
├── package.json
├── wrangler.toml
├── schema.sql
├── .gitignore
├── .dev.vars.example
├── migrate/
│   ├── 00-schema.sql
│   ├── 01-volunteers-import.sql
│   └── 02-cleanup-optional.sql
└── SETUP.md
```

Delete the old `server.js` and `.env`.

Before committing, open `wrangler.toml` and set `ALLOWED_ORIGINS` to your real
website address (the Cloudflare Pages URL, plus your custom domain if you have
one, comma-separated).

### Option A — deploy from the Cloudflare dashboard (no terminal)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Workers** →
   **Import a repository**.
2. Pick `stepin2green-backend`, leave the build command empty, deploy command
   `npx wrangler deploy`.
3. After the first deploy: your Worker → **Settings** → **Variables and
   Secrets** → add three **Secrets**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the `mysql://…` string from Part 1 |
   | `BREVO_API_KEY` | the `xkeysib-…` key from Part 3 |
   | `ADMIN_PASSWORD` | a long random password you invent — this protects `/admin` |

4. **Deploy** again so the secrets take effect.

### Option B — deploy from your terminal

```bash
cd stepin2green-backend
npm install
npx wrangler login

npx wrangler secret put DATABASE_URL
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put ADMIN_PASSWORD

npx wrangler deploy
```

Your API is now live at something like
`https://stepin2green-backend.<your-subdomain>.workers.dev`.

To watch live logs while testing: `npx wrangler tail`.

---

## Part 5 — Point the website at the new backend

In your website repo's `index.html`, find this line (near the bottom, in the
`FORM SUBMISSION` script block):

```js
const API_URL = 'https://stepin2green-backend-production.up.railway.app/api/volunteers';
```

Change it to your Worker URL:

```js
const API_URL = 'https://stepin2green-backend.YOUR-SUBDOMAIN.workers.dev/api/volunteers';
```

That is the **only** change the website needs. Commit and push — Cloudflare
Pages redeploys automatically.

---

## Part 6 — Check it works

1. Open your Worker's root URL → you should see the API status JSON.
2. Open `https://…workers.dev/admin` → your browser asks for a username and
   password. Leave the username blank (or type anything) and enter your
   `ADMIN_PASSWORD`. You should see your migrated submissions.
3. Go to the live website, fill in the form with your own email, submit.
4. Refresh `/admin` — the new row should be at the top, with the time in
   Malaysian time.
5. Check your inbox (and spam) for the confirmation email.

If something fails, `npx wrangler tail` shows the exact error.

---

## Part 7 — Security clean-up (please don't skip)

Three things in the old setup are worth fixing now:

1. **Revoke the Gmail app password.** Your old `.env` contained
   `EMAIL_PASS=lmkuyhqifeozwzvt`. That's a Google app password for
   `stepin2green2@gmail.com` and it can send mail as you. Go to
   <https://myaccount.google.com/apppasswords> and delete it. Nothing in the new
   backend uses it.

2. **Check whether `.env` was ever committed.** In the backend repo:

   ```bash
   git log --all --oneline -- .env
   ```

   If that prints anything, the secrets are in your GitHub history even after
   you delete the file — rotate the Brevo key and the database password too.
   The new `.gitignore` prevents this happening again.

3. **`/admin` used to be public.** Anyone who guessed the URL could read every
   volunteer's name, email and Instagram handle — real personal data. It now
   requires a password, and so does `GET /api/volunteers`.

Also new, while I was in there: submitted text is HTML-escaped before it hits
the admin page (a name containing `<script>` can no longer run code in your
browser), fields are length-capped, emails are format-checked, CORS is
restricted to your own site instead of everyone, and `/admin/export.csv`
downloads everything as a spreadsheet.

---

## Running it locally (optional)

```bash
cp .dev.vars.example .dev.vars   # then fill in the real values
npx wrangler dev
```

`.dev.vars` is gitignored.

---

## What to watch

Nothing, really — but if you ever want to check:

- **TiDB Cloud** → cluster → *Usage* shows request units used this month
  (you get 50M; a form submission costs a handful).
- **Cloudflare** → Worker → *Metrics* shows requests per day (100k/day free).
- **Brevo** → *Statistics* shows emails sent (300/day free).

A TiDB Starter cluster does **not** get deleted for inactivity, so a quiet month
is fine.
