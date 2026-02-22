# Estate Agent Hub

A full-stack web app for real estate agents to manage leads, auto-reply to emails, and send bulk campaigns — powered by Gmail and Excel.

---

## Features

| Feature | Description |
|---------|-------------|
| **Gmail Connect** | OAuth2 login — no passwords stored |
| **Inbox Viewer** | Browse and search your Gmail inbox inside the app |
| **Auto-Reply Rules** | Define rules: "if email from X, reply with template Y" |
| **Contact Management** | Add, search, delete contacts stored in Excel |
| **Import Excel** | Upload any `.xlsx`/`.xls`/`.csv` with Name, Email, Phone, Property Interest |
| **Export Excel** | Download your full contact list as a formatted `.xlsx` |
| **Bulk Email** | Select contacts and send personalised emails via your Gmail |

---

## Quick Start

### 1. Clone & install

```bash
git clone <repo-url>
cd Louis-Project
npm install
```

### 2. Set up Google OAuth2

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → **APIs & Services → Credentials**
3. Click **Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Add authorised redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Enable the **Gmail API** under **APIs & Services → Library**
7. Copy your **Client ID** and **Client Secret**

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
NEXTAUTH_SECRET=run_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

Generate a secret:
```bash
openssl rand -base64 32
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — click **Connect with Gmail** and sign in.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx               # Dashboard
│   ├── contacts/page.tsx      # Contact manager
│   ├── email/
│   │   ├── inbox/page.tsx     # Inbox viewer
│   │   ├── rules/page.tsx     # Auto-reply rules
│   │   └── bulk/page.tsx      # Bulk email sender
│   └── api/
│       ├── auth/[...nextauth] # Gmail OAuth2
│       ├── gmail/
│       │   ├── inbox          # GET — fetch emails
│       │   ├── auto-reply     # CRUD — manage rules
│       │   ├── run-rules      # POST — scan inbox & reply
│       │   └── send-bulk      # POST — bulk send
│       └── contacts/
│           ├── list           # GET — read contacts
│           ├── add            # POST — add one contact
│           ├── delete         # DELETE — remove contact
│           ├── upload         # POST — import Excel file
│           └── export         # GET — download contacts.xlsx
├── lib/
│   ├── gmail.ts               # Gmail API wrappers
│   ├── contacts.ts            # Excel read/write (SheetJS)
│   └── rules.ts               # Auto-reply rule storage (JSON)
└── types/index.ts             # Shared TypeScript types
data/                          # Auto-created — contacts.xlsx, rules.json
```

---

## Excel Format

When importing, the app recognises these column headers (case-insensitive):

| Column | Aliases |
|--------|---------|
| Name | name |
| Email | email |
| Phone | phone, number |
| Property Interest | propertyInterest, Property |
| Notes | notes |

Duplicate emails are skipped automatically.

---

## Email Template Variables

Use in auto-reply templates and bulk email bodies:

| Placeholder | Replaced with |
|-------------|--------------|
| `{{name}}` | Sender's / contact's name |
| `{{email}}` | Sender's / contact's email |
| `{{subject}}` | Original email subject |
| `{{phone}}` | Contact's phone number |
| `{{propertyInterest}}` | Contact's property preference |

---

## Auto-Reply Logic

1. Click **Run Auto-Reply Now** on the dashboard (or the Rules page)
2. The app scans your last 50 unread inbox emails
3. Each email is matched against active rules (from-address + optional subject filter)
4. A reply is sent via your Gmail — only once per email thread
5. Replied thread IDs are stored in `data/replied_threads.json` to prevent duplicates

---

## Tech Stack

- **Next.js 14** (App Router)
- **NextAuth.js** — Google OAuth2
- **googleapis** — Gmail API
- **SheetJS (xlsx)** — Excel read/write
- **Tailwind CSS** — styling
- **Lucide React** — icons
