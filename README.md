# Zaviri Outreach — Agency CRM

A shared, editable spreadsheet-style tracker for the Zaviri agency cold-outreach:
agency contacts, pipeline status, trial dates, suggested pricing, discounts, and
a follow-up log — live for you and your friend, on any device, no Notion needed.

It's a small website (Next.js) with a database behind it (Supabase, free tier).
You don't need to know how any of this works to run it — just follow the steps
below in order. It'll take about 15–20 minutes the first time.

---

## 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project**. Pick any name and password (save the password
   somewhere, you won't need it again for this but Supabase asks for it).
3. Once the project is created, go to the **SQL Editor** (left sidebar).
4. Click **New query**, paste in the entire contents of `supabase/schema.sql`
   (in this folder), and click **Run**. This creates the two tables
   (`agencies`, `followups`) and the view that does all the automatic
   calculations (trial end dates, suggested pricing, etc).
5. Go to **Settings → API** (left sidebar). You'll need two values from this
   page in a minute:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role key** (under "Project API keys" — click "reveal" to see it.
     This is a secret key, don't share it or commit it to a public GitHub repo.)

## 2. Push this project to GitHub

1. Create a new (private) repository on [github.com](https://github.com).
2. Upload this whole folder to it. Easiest way if you're not used to git:
   on the new repo's page, click "uploading an existing file" and drag
   everything in. Or ask whoever you're working with in Cursor — Cursor can
   do this for you with one prompt ("push this folder to a new GitHub repo
   called zaviri-crm").

## 3. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up / log in (you can use
   your GitHub account to sign in, which makes step 2 below easier).
2. Click **Add New → Project**, and import the GitHub repo you just created.
3. Before clicking Deploy, open **Environment Variables** and add these four:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1 |
   | `APP_PASSWORD` | a password you make up — this is what you and your friend type to get into the site |
   | `MCP_SHARED_SECRET` | a separate long random secret used only by MCP clients |

4. Click **Deploy**. Wait ~1 minute. Vercel gives you a live URL
   (like `zaviri-crm.vercel.app`) — that's your site.

That's it. Visit the URL, enter the password you set, and you're in.

## MCP access

Point an MCP client at `https://YOUR-DOMAIN/api/mcp` and send the shared
secret as `Authorization: Bearer YOUR_MCP_SHARED_SECRET`. The endpoint is a
stateless JSON-RPC HTTP server and does not require an MCP SDK or an SSE
connection.

Its tools cover agency search/details and safe field updates, phone-number
lists, statuses and calculated pricing, timestamped notes, completed contact
history, scheduled follow-ups, and tickets (including priority, tags, ticket
email, deadlines, completion and restore). It deliberately does not expose
agency deletion or status-definition changes.

---

## Using it day to day

- **Click any white cell** to edit it — name, phone, notes, dates, whatever.
  It saves automatically when you click away.
- **Status** is a dropdown with color coding (grey = not contacted yet,
  yellow = trial, green = converted, red = declined/churned).
- Columns like **Suggested €/listing**, **Trial end**, **Days left**,
  **Last follow-up** and **Next follow-up** are calculated automatically —
  you never type those in directly.
- Click **Follow-ups** on any row to see/add the call history for that
  agency — that's also what "Last follow-up" and "Next follow-up" are based on.
- The **"Due follow-ups only"** button at the top filters the table down to
  agencies whose next follow-up is overdue — that's your daily worklist.
- **+ Add** in the header adds a new agency row.

## If something breaks

- If the whole site shows an error mentioning `APP_PASSWORD` or `SUPABASE`,
  double check the three environment variables in Vercel (Project → Settings
  → Environment Variables) — a typo there is the most common issue. After
  fixing one, you need to redeploy (Vercel → Deployments → ⋯ → Redeploy).
- Editing code: open this folder in Cursor like your other projects. The
  bulk of the logic lives in `components/AgencyTable.js` (the grid) and
  `supabase/schema.sql` (the pricing tiers and calculations — e.g. if your
  real pricing changes from the 20€/15€/13€ example, edit the `case when`
  block in that file and re-run it in the Supabase SQL Editor).

## Security note

This is gated by a single shared password (not per-person logins), which is
fine for a two-person internal tool but means anyone with the password and
link has full read/write access. Don't share the link or password beyond you
and your friend.
balls
