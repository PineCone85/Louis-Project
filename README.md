# Foyer

A single-user CRM for a residential real estate agent. Clients, properties, a buyer pipeline, and every client conversation from Gmail and WhatsApp in one place, with predefined automatic replies the agent controls.

Built with Next.js 16, React 19, Tailwind CSS 4, Drizzle ORM and Postgres. Designed to deploy on Vercel with a free-tier Neon database.

## What it does

- **Clients**: create, edit, archive and delete clients; budgets, areas, requirements and notes; follow-up reminders; an activity log of notes, calls, meetings and viewings.
- **Pipeline**: a residential buyer pipeline (Prospect, Contacted, Qualified, Property Search, Viewing, Interested, Offer Submitted, Negotiation, Offer Accepted, Closing, Completed, Lost) with a drag-and-drop board and per-client stage controls. Every stage change is logged.
- **Properties**: manual property records with price, location, specifications, features and private notes. Link properties to clients with a status (suggested, interested, viewing scheduled, viewed, offer made, not interested, purchased), viewing dates and notes. Both directions are visible.
- **Gmail**: connect a Google account with OAuth. Incoming mail is matched to clients by email address, shown on the client timeline and in the unified inbox, and can be replied to from the CRM (replies thread correctly in Gmail). Mail you send from Gmail itself to known clients is imported too. Attachments open through the CRM.
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
| WhatsApp | Meta WhatsApp Business Cloud API with signed webhooks |
| Scheduling | Vercel Cron (or any scheduler) hitting `/api/cron/sync`, plus in-app polling while the CRM is open |
| Styling | Tailwind CSS 4, white / sage / black palette, Inter and Instrument Serif |

There is no background worker. Gmail is synchronised by:

1. the app itself every 45 seconds while it is open (an incremental `history.list` call),
2. the scheduled `/api/cron/sync` endpoint (daily on Vercel Hobby, as often as you like on Pro or with an external scheduler), and
3. Gmail push notifications through Google Cloud Pub/Sub, if configured, for instant delivery.

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
| `AUTH_SECRET` | yes | `openssl rand -base64 48` |
| `CRON_SECRET` | yes | Any random string; Vercel Cron sends it automatically |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Gmail | From Google Cloud |
| `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_TOKEN` | optional | Instant Gmail notifications |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | From Meta for Developers |

Then deploy. The included `vercel.json` schedules `/api/cron/sync` once a day (the most the Hobby plan allows). On Pro you can change the schedule to `*/5 * * * *`. Any external scheduler can also call `GET {APP_URL}/api/cron/sync` with the header `Authorization: Bearer {CRON_SECRET}`.

### 3. Gmail (Google Cloud)

1. Create a project at console.cloud.google.com and enable the **Gmail API** (APIs & Services > Library).
2. Configure the **OAuth consent screen**. Add your Gmail address as a test user. Add the scope `https://www.googleapis.com/auth/gmail.modify`.
3. Create an **OAuth client ID** of type Web application with the authorised redirect URI `{APP_URL}/api/auth/google/callback`. Copy the client ID and secret into the environment.
4. In the CRM, open **Settings > Gmail** and click **Connect Gmail**. The last 30 days of inbox and sent mail are imported in the background (promotions and social mail are skipped).

Publishing status matters: while the consent screen is in *Testing*, Google expires refresh tokens after 7 days and you will have to reconnect weekly. For a Google Workspace account set the user type to *Internal*. For a personal Gmail account, publish the app to *Production*; with a single user you can proceed through the "unverified app" screen without completing Google's verification.

Optional instant notifications (Pub/Sub):

1. Enable the **Cloud Pub/Sub API** and create a topic, for example `projects/my-project/topics/gmail-crm`.
2. Grant the service account `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic.
3. Create a **push subscription** on the topic with the endpoint `{APP_URL}/api/webhooks/gmail?token={GMAIL_PUSH_TOKEN}`.
4. Set `GMAIL_PUBSUB_TOPIC` and `GMAIL_PUSH_TOKEN`, redeploy, then click **Enable push notifications** in Settings > Gmail. The watch is renewed automatically during sync.

### 4. WhatsApp (Meta WhatsApp Business Platform)

1. At developers.facebook.com create a **Business** app and add the **WhatsApp** product. Meta provides a test number immediately; to use your own business number, add and verify it under WhatsApp > API Setup (a number already registered with the consumer WhatsApp app must be removed from it first).
2. Copy the **Phone number ID** and **WhatsApp Business Account ID** from API Setup.
3. Create a permanent access token: Business Settings > Users > **System users**, create a system user with admin access, assign the app with full control, and generate a token with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions. Put it in `WHATSAPP_ACCESS_TOKEN`.
4. Copy the app secret from App settings > Basic into `WHATSAPP_APP_SECRET`, and choose any random string for `WHATSAPP_VERIFY_TOKEN`.
5. Deploy, then under WhatsApp > Configuration set the callback URL to `{APP_URL}/api/webhooks/whatsapp` with your verify token, and subscribe to the **messages** field.
6. Create and submit message templates in Meta Business Manager (WhatsApp Manager > Message templates). Approved templates appear in the CRM for starting conversations outside the 24-hour window.

WhatsApp rules to keep in mind: you can send free-form messages only within 24 hours of the customer's last message; outside that window the CRM offers your approved templates. Conversations started by customers are free on the platform; template messages may be billed by Meta.

## Automatic replies

Settings > Templates holds the reply content. Settings > Automatic replies has master switches per channel and an ordered rule list. For each incoming message the rules are checked in order and the first match sends its template; cooldowns prevent repeated replies to the same contact, and email rules can be limited to one reply per conversation. Replies are never sent to mailing lists, bulk mail, bounces or no-reply addresses, and never for mail that pre-dates the Gmail connection.

## Security notes

- Passwords are hashed with scrypt; sessions are HS256 JWTs in an httpOnly, SameSite cookie; failed logins are throttled per IP.
- Google refresh tokens are encrypted at rest with a key derived from `AUTH_SECRET`.
- WhatsApp webhooks are verified with the `X-Hub-Signature-256` HMAC; Gmail push and cron endpoints require their shared secrets.
- Email HTML is sanitised before storage; attachments and WhatsApp media are proxied through authenticated endpoints and never stored in the database.
- The app sets `X-Frame-Options`, `X-Content-Type-Options` and a referrer policy on every response.

## Project layout

```
src/app            routes (App Router), API route handlers, global styles
src/components     UI: shell, clients, conversation timeline and composers, pipeline, properties, settings
src/lib/db         Drizzle schema and connection
src/lib/gmail      OAuth, Gmail API client, MIME parsing and building, sync, sending
src/lib/whatsapp   Cloud API client, webhook parsing and verification, sending
src/lib/messaging  ingestion, client matching, notifications, activity log
src/lib/auto-reply rule engine and template rendering
src/lib/actions    server actions (mutations)
src/lib/queries    read queries
drizzle            SQL migrations
scripts            migration runner and password hashing
tests              vitest unit tests
```
