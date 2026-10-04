# Foyer

A single-user CRM for a residential real estate agent. Clients, properties, a buyer pipeline, and every client conversation from Gmail and WhatsApp in one place, with predefined automatic replies the agent controls.

Built with Next.js 16, React 19, Tailwind CSS 4, Drizzle ORM and Postgres. Designed to deploy on Vercel with a free-tier Neon database.

## What it does

- **Clients**: create, edit, archive and delete clients; budgets, areas, requirements and notes; follow-up reminders; an activity log of notes, calls, meetings and viewings.
- **Pipeline**: a residential buyer pipeline (Prospect, Contacted, Qualified, Property Search, Viewing, Interested, Offer Submitted, Negotiation, Offer Accepted, Closing, Completed, Lost) with a drag-and-drop board and per-client stage controls. Every stage change is logged.
- **Properties**: manual property records with price, location, specifications, features and private notes. Link properties to clients with a status (suggested, interested, viewing scheduled, viewed, offer made, not interested, purchased), viewing dates and notes. Both directions are visible.
- **Gmail and Outlook**: connect one or more mailboxes with OAuth: Google (Gmail or Google Workspace) and Microsoft (Microsoft 365, Exchange Online or personal Outlook.com). Incoming mail is matched to clients by email address, shown on the client timeline and in the unified inbox, and can be replied to from the CRM (replies thread correctly in the mailbox). Mail you send from the mailbox itself to known clients is imported too. Attachments open through the CRM.
- **WhatsApp**: the official WhatsApp Business Platform (Cloud API). Incoming messages are matched to clients by mobile number; text, images, documents, audio, video, locations and contacts are supported. Reply from the CRM inside the 24-hour customer service window, or send an approved template message outside it.
- **Unified inbox and notifications**: every conversation across both channels, unread counts, an unread badge in the navigation, in-app notifications for new messages, and a dashboard list of clients who need attention. Conversations from unknown senders can be linked to an existing client or turned into a new client in one click.
- **Automatic replies**: deterministic rules (every message, first message from a new contact, keyword match, outside business hours), scoped to clients or unknown contacts and to pipeline stages, with cooldowns and once-per-conversation protection. Replies use your own templates. Nothing is AI-generated. Automated senders, bulk mail and bounces never receive a reply.
- **Templates**: reusable quick replies with placeholders such as `{{first_name}}` and `{{agent_name}}`.
- **One secure account**: a single administrator with a hashed password, signed session cookie, login throttling and encrypted OAuth tokens at rest.

## Architecture

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Database | Postgres via Drizzle ORM (`pg` driver). Neon's free tier works well on Vercel |
| Auth | Single admin: `ADMIN_EMAIL` + scrypt password hash, HS256 JWT session cookie |
| Gmail | Google OAuth 2.0 (PKCE), Gmail REST API, incremental `history` sync, optional Pub/Sub push |
| Outlook | Microsoft identity platform OAuth 2.0 (PKCE), Microsoft Graph mail API, delta-query sync, optional change-notification webhooks |
| WhatsApp | Meta WhatsApp Business Cloud API with signed webhooks |
| Scheduling | Vercel Cron (or any scheduler) hitting `/api/cron/sync`, plus in-app polling while the CRM is open |
| Styling | Tailwind CSS 4, white / sage / black palette, Inter and Instrument Serif |

There is no background worker. Mailboxes are synchronised by:

1. the app itself every 45 seconds while it is open (an incremental Gmail `history.list` or Graph delta call per mailbox),
2. the scheduled `/api/cron/sync` endpoint (daily on Vercel Hobby, as often as you like on Pro or with an external scheduler), and
3. push notifications, if configured, for instant delivery: Google Cloud Pub/Sub for Gmail, Microsoft Graph change notifications for Outlook.

WhatsApp messages arrive instantly through Meta's webhook.

## Local development

Requirements: Node 20.9+ and a Postgres database.

```bash
npm install
cp .env.example .env            # then fill in the values
npm run auth:hash -- "a strong password"   # paste the output into ADMIN_PASSWORD_HASH
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and sign in with `ADMIN_EMAIL` and the password you hashed.

Other scripts:

```bash
npm run build      # runs migrations, then builds
npm run typecheck
npm run lint
npm test           # vitest unit tests
npm run db:generate   # generate a new migration after changing src/lib/db/schema.ts
npm run db:studio     # Drizzle Studio
```

## Deploying to Vercel

### 1. Database (Neon)

1. In the Vercel project, open **Storage** and create a **Neon Postgres** database (free tier), or create one at neon.tech.
2. Copy the pooled connection string into the `DATABASE_URL` environment variable.

Migrations run automatically during `npm run build`, so every deploy keeps the schema current.

### 2. Environment variables

Add these in **Settings > Environment Variables** (see `.env.example` for descriptions):

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | yes | `https://your-app.vercel.app` (no trailing slash) |
| `DATABASE_URL` | yes | Postgres connection string |
| `ADMIN_EMAIL` | yes | The agent's login email |
| `ADMIN_PASSWORD_HASH` | yes | Output of `npm run auth:hash -- "password"` |
| `ADDITIONAL_USERS` | no | Extra sign-ins that share the same data, as comma-separated `email:hash` pairs. Generate an entry with `npm run auth:user -- "email" "password"` |
| `AUTH_SECRET` | yes | `openssl rand -base64 48` |
| `CRON_SECRET` | yes | Any random string; Vercel Cron sends it automatically |
| `ANTHROPIC_API_KEY` | no | Enables the **Draft with AI** button in the reply composer (Claude drafts replies from the client record, linked properties and the thread) |
| `ANTHROPIC_MODEL` | no | Override the Claude model used for drafts (default `claude-opus-5`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Gmail | From Google Cloud |
| `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_TOKEN` | optional | Instant Gmail notifications |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | for Outlook | From the Microsoft Entra app registration |
| `MICROSOFT_TENANT` | optional | `common` (default) or your tenant ID |
| `MICROSOFT_WEBHOOK_SECRET` | optional | Instant Outlook notifications |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | From Meta for Developers |

Then deploy. The included `vercel.json` schedules `/api/cron/sync` once a day (the most the Hobby plan allows). On Pro you can change the schedule to `*/5 * * * *`. Any external scheduler can also call `GET {APP_URL}/api/cron/sync` with the header `Authorization: Bearer {CRON_SECRET}`.

### 3. Gmail (Google Cloud)

1. Create a project at console.cloud.google.com and enable the **Gmail API** (APIs & Services > Library).
2. Configure the **OAuth consent screen**. Add your Gmail address as a test user. Add the scope `https://www.googleapis.com/auth/gmail.modify`.
3. Create an **OAuth client ID** of type Web application with the authorised redirect URI `{APP_URL}/api/auth/google/callback`. Copy the client ID and secret into the environment.
4. In the CRM, open **Settings > Email accounts** and click **Connect Gmail**. The last 30 days of inbox and sent mail are imported in the background (promotions and social mail are skipped).

Publishing status matters: while the consent screen is in *Testing*, Google expires refresh tokens after 7 days and you will have to reconnect weekly. For a Google Workspace account set the user type to *Internal*. For a personal Gmail account, publish the app to *Production*; with a single user you can proceed through the "unverified app" screen without completing Google's verification.

Optional instant notifications (Pub/Sub):

1. Enable the **Cloud Pub/Sub API** and create a topic, for example `projects/my-project/topics/gmail-crm`.
2. Grant the service account `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic.
3. Create a **push subscription** on the topic with the endpoint `{APP_URL}/api/webhooks/gmail?token={GMAIL_PUSH_TOKEN}`.
4. Set `GMAIL_PUBSUB_TOPIC` and `GMAIL_PUSH_TOKEN`, redeploy, then click **Enable push** next to the mailbox in Settings > Email accounts. The watch is renewed automatically during sync.

### 4. Outlook (Microsoft 365, Exchange Online or Outlook.com)

Outlook mailboxes connect through the Microsoft Graph API with an app registration in Microsoft Entra ID. One registration serves both work accounts and personal accounts.

1. Sign in at entra.microsoft.com (or portal.azure.com). App registrations live in a directory (tenant): if you have Microsoft 365 for your business, use that account; otherwise create a free Azure account, which comes with a default directory. No paid subscription is needed. Open **Identity > Applications > App registrations > New registration**.
2. Name the app (for example "Foyer CRM"). Under **Supported account types** choose the option that includes personal Microsoft accounts, labelled **Any Entra ID tenant + Personal Microsoft accounts** (older portals: "Accounts in any organizational directory and personal Microsoft accounts"), so that both Microsoft 365 and outlook.com mailboxes can sign in. (If only one organisation will ever use it, choose single tenant and set `MICROSOFT_TENANT` to that tenant ID.)
3. Under **Redirect URI** choose the **Web** platform and enter `{APP_URL}/api/auth/microsoft/callback`. Add `http://localhost:3000/api/auth/microsoft/callback` as well if you develop locally.
4. On the Overview page copy the **Application (client) ID** into `MICROSOFT_CLIENT_ID`.
5. Open **Certificates & secrets > New client secret**, choose an expiry, and copy the secret **Value** (not the Secret ID) into `MICROSOFT_CLIENT_SECRET`. Note the expiry: you will need to create a new secret before then.
6. Open **API permissions > Add a permission > Microsoft Graph > Delegated permissions** and add `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `User.Read` and `offline_access`. None of these require admin consent by default. Personal accounts consent for themselves; in a Microsoft 365 organisation the tenant's user-consent policy decides whether the user can approve the app alone or an administrator must grant consent first (Enterprise applications > Consent and permissions).
7. Deploy, then in the CRM open **Settings > Email accounts** and click **Connect Outlook**. Sign in with the mailbox you use with clients. The last 30 days of inbox and sent mail are imported in the background.

Replies are created with Outlook's own reply function, so they thread correctly and include the quoted original, exactly as if sent from Outlook. The first import covers the last 30 days and, as Microsoft caps a filtered import at 5,000 messages per folder, keeps the newest ones in a very busy mailbox; everything that arrives after connecting is tracked incrementally.

Optional instant notifications: set `MICROSOFT_WEBHOOK_SECRET` to a random string of up to 128 characters and redeploy. During the next sync the CRM registers a Microsoft Graph change-notification subscription for the inbox pointing at `{APP_URL}/api/webhooks/outlook`, renews it a day before it expires, and recreates it if Microsoft removes it. This needs the public HTTPS address of the deployment; it is skipped on localhost.

Client secrets expire (two years at most). When the secret expires, mail stops syncing with a "reconnect" error; create a new secret, update `MICROSOFT_CLIENT_SECRET`, redeploy and reconnect the mailbox.

### 5. WhatsApp (Meta WhatsApp Business Platform)

1. At developers.facebook.com create a **Business** app and add the **WhatsApp** product. Meta provides a test number immediately; to use your own business number, add and verify it under WhatsApp > API Setup (a number already registered with the consumer WhatsApp app must be removed from it first).
2. Copy the **Phone number ID** and **WhatsApp Business Account ID** from API Setup.
3. Create a permanent access token: Business Settings > Users > **System users**, create a system user with admin access, assign the app with full control, and generate a token with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions. Put it in `WHATSAPP_ACCESS_TOKEN`.
4. Copy the app secret from App settings > Basic into `WHATSAPP_APP_SECRET`, and choose any random string for `WHATSAPP_VERIFY_TOKEN`.
5. Deploy, then under WhatsApp > Configuration set the callback URL to `{APP_URL}/api/webhooks/whatsapp` with your verify token, and subscribe to the **messages** field.
6. Create and submit message templates in Meta Business Manager (WhatsApp Manager > Message templates). Approved templates appear in the CRM for starting conversations outside the 24-hour window.

WhatsApp rules to keep in mind: you can send free-form messages only within 24 hours of the customer's last message; outside that window the CRM offers your approved templates. Conversations started by customers are free on the platform; template messages may be billed by Meta.

## Automatic replies

Settings > Templates holds the reply content. Settings > Automatic replies has master switches per channel and an ordered rule list. For each incoming message the rules are checked in order and the first match sends its template; cooldowns prevent repeated replies to the same contact, and email rules can be limited to one reply per conversation. Triggers: every message, first message from a contact, keywords, outside business hours, an away period between two dates (a holiday reply that switches itself off when you are back), or a window that repeats every week (for example Friday 17:30 to Monday 08:00). Business hours can differ per weekday. Replies are never sent to mailing lists, bulk mail, bounces or no-reply addresses, and never for mail that pre-dates the Gmail connection.

## Workflows

Settings > Workflows lets you automate almost anything in Foyer with "when X happens, if Y, then do Z" rules.

- **Triggers:** a client is added, changes stage, or has an activity logged; a follow-up becomes due; a client goes quiet; a property is added, edited, changes status, is linked to a client, or a client's interest in it changes; a message is received; you send a message.
- **Conditions:** any field of the client, property, message or link, with operators such as is, contains, is one of, at least and at most. Match all or any.
- **Actions**, run in order: **AI: draft a message** (to the client in the event, to clients who match the property, or to clients already linked to it), **Send a template**, **Notify me**, **Add a note**, **Schedule a follow-up**, **Move the client to a stage**, **Link the property to matching clients**, **Change the property's status**, and **Call a webhook** (JSON, HMAC-signed).
- **Drafts:** AI-written messages are never sent automatically. They land on the **Drafts** page with the reason they were written and a "check before sending" note; edit, send or dismiss each one.
- **Recipes** give you one-click starting points, for example "New listing → AI drafts for matching clients". The matcher scores clients on budget, preferred areas, bedrooms and requested features.
- Time-based triggers (follow-up due, gone quiet) are checked whenever messages are synced, including by the cron job. Every run is logged with what each step did.

## Pipeline

Settings > Pipeline lets you rename, reorder, add and remove the stages clients move through. Each stage belongs to a group (Lead, Active, Transaction, Closed) that drives the dashboard counts, the board and the stage colours. Stage keys stay fixed when a stage is renamed, so existing clients, auto-reply rules and workflows keep working. A stage that still has clients in it cannot be removed.

## Security notes

- Passwords are hashed with scrypt; sessions are HS256 JWTs in an httpOnly, SameSite cookie; failed logins are throttled per IP.
- Google and Microsoft refresh tokens are encrypted at rest with a key derived from `AUTH_SECRET`.
- WhatsApp webhooks are verified with the `X-Hub-Signature-256` HMAC; Gmail push, Outlook notifications and cron endpoints require their shared secrets.
- Email HTML is sanitised before storage; attachments and WhatsApp media are proxied through authenticated endpoints and never stored in the database.
- The app sets `X-Frame-Options`, `X-Content-Type-Options` and a referrer policy on every response.

## Demo mode

The repository ships with a self-contained demo: a Cape Town agency with clients at every pipeline stage, properties in every status, email and WhatsApp conversations, activities, templates, auto-reply rules and notifications. It runs against its own database and its own login so it never touches real data.

```bash
# once: create the demo database (adjust if your Postgres user differs)
sudo -u postgres psql -c "CREATE DATABASE foyer_demo OWNER foyer;"

npm run demo:seed   # migrate + wipe + seed the demo database (safe to re-run)
npm run demo        # start the demo on http://localhost:3001
```

Log in with **demo@foyer.demo** / **FoyerDemo1**. Settings live in `.env.demo`, which is committed because everything in it is fake. The seed dates are relative to today, so the dashboard always shows something due, something overdue and someone who has gone quiet. Re-run `npm run demo:seed` at any time to reset the demo. The seed refuses to run against a database whose name does not contain "demo" unless you pass `--force`.

The demo can run next to `npm run dev`: it uses port 3001 and builds into `.next-demo`. Gmail and WhatsApp are not connected in the demo; instead `FOYER_DEMO=true` shows the reply composers and records sent messages without calling Google or Meta, and `AI_DRAFT_DEMO=true` makes the **Draft with AI** button return pre-written drafts for the seeded clients (see `src/lib/ai/demo-drafts.ts`). A presenter script lives in `docs/demo-script.md`.

## Project layout

```
src/app            routes (App Router), API route handlers, global styles
src/components     UI: shell, clients, conversation timeline and composers, pipeline, properties, settings
src/lib/db         Drizzle schema and connection
src/lib/email      shared mailbox layer: accounts and tokens, sync orchestration, sending
src/lib/gmail      Google OAuth, Gmail API client, MIME parsing and building, sync, sending
src/lib/outlook    Microsoft OAuth, Graph API client, message parsing, delta sync, sending
src/lib/whatsapp   Cloud API client, webhook parsing and verification, sending
src/lib/messaging  ingestion, client matching, notifications, activity log
src/lib/auto-reply rule engine and template rendering
src/lib/actions    server actions (mutations)
src/lib/queries    read queries
drizzle            SQL migrations
scripts            migration runner and password hashing
tests              vitest unit tests
```
