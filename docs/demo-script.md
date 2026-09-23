# Foyer demo script

A 12-minute walkthrough of the seeded demo. Everything referenced below exists in the demo data; the names are the ones you'll see on screen.

## Before you start

- Run `npm run demo:seed` to reset the data (opening conversations marks them read, so reseed between demos).
- Run `npm run demo` and open http://localhost:3001 in a clean browser window.
- Log in with **demo@foyer.demo** / **FoyerDemo1**.
- Sending email or WhatsApp in the demo is simulated: the message is saved to the timeline but nothing leaves the machine. "Draft with AI" returns pre-written drafts for the seeded clients.

## 1. Login and framing (0:30)

**Click:** log in.

**Say:** "Foyer is a CRM built for one agent. It sits on top of the Gmail and WhatsApp Business accounts you already use, so every client conversation lands in one place, next to the client's record and the properties they're looking at. There's nothing to migrate and no team seats to pay for."

## 2. Dashboard (1:30)

**Click:** you land on the dashboard.

**Point out:**
- "Good day, Sam" and the line under it: two clients have sent messages that haven't been read.
- **Needs attention**: Thandi Mokoena (new website enquiry) and James van der Merwe (WhatsApp).
- **Follow-ups due**: Thandi is due today; Priya Reddy is overdue.
- **Pipeline** summary counts per stage.
- **Recent activity**: notes, calls and stage changes across all clients.
- **Gone quiet**: Grace Mbeki, a landlord nobody has spoken to in nearly three weeks.

**Say:** "This is the morning view. Who wrote to me, who I promised to call, and who I've let slip."

## 3. Inbox and filters (2:00)

**Click:** Inbox.

**Point out:** email and WhatsApp conversations in one list, one row per contact, with the client's pipeline stage on each row.

**Click:** **Unread**, then **Email** / **WhatsApp**, then **Clients only**.

**Say:** "Clients only hides anyone who isn't in the CRM yet: newsletters, portal alerts, unknown numbers. Switch back to Everyone and you'll see three of those."

**Click:** the message from **The Foyer Team**. It shows a "Not a client" badge and a box offering to link the conversation to an existing client or create a new one.

**Click:** the WhatsApp from **Zanele** (unknown number asking about the Woodstock loft).

**Say:** "One click turns an unknown enquiry into a client, with the name and number already filled in. Every message from that number is then attached to their record, past and future."

## 4. Reply with AI: Thandi (2:30)

**Click:** Thandi Mokoena's email in the inbox.

**Point out:** her enquiry, and the reply below it marked **auto-reply**. That went out automatically the moment her email arrived, from an auto-reply rule we'll see in Settings.

**Click:** **Draft with AI** under the reply box.

**Say (while it loads):** "Foyer hands the client's record, the properties linked to her and the whole thread to Claude, and asks for a reply in my voice."

**Point out:** the draft fills the box, with the signature added. Under it, a **Check before sending** note flags the placeholder for viewing times and the brochure to attach.

**Say:** "It never invents a price or a date. Where I need to supply something, it leaves a bracket and tells me. I edit, then send."

**Click:** **Add instructions**, type "offer Saturday morning", press Enter. Note that the demo draft is fixed, but the instruction is acknowledged in the note; live drafts follow it.

**Click:** **Send email**. The reply appears in the timeline immediately.

## 5. Reply with AI: James on WhatsApp (1:00)

**Click:** James van der Merwe in the inbox.

**Point out:** the green notice: free-form replies are allowed for 24 hours after his last message, which is WhatsApp's rule, and Foyer tracks it. After that, only approved templates can be sent, and Foyer switches to that mode automatically.

**Click:** **Draft with AI**, then **Send WhatsApp**.

**Say:** "Same idea, shorter and more casual, because it's WhatsApp."

## 6. Client profile and timeline (2:00)

**Click:** Clients, then **Priya Reddy**.

**Point out:**
- The profile: buyer, Qualified, R4m to R5.2m, Constantia and Newlands, two dogs, a study is non-negotiable, and a second email address (her work one, which Foyer matched automatically).
- **Properties**: the Constantia family home is linked as Suggested.
- The **timeline**: the referral email from Elena, the qualification call, the stage change and the thread with her work address, all in date order.

**Click:** the note box at the top, type "Confirmed Saturday 10:00 and 11:30", choose Call, save. Then set the next follow-up to next week.

**Click:** the **Pipeline stage** dropdown and move her to Property Search.

**Say:** "Every change is logged. Nothing about a client lives in my head or in a notebook."

## 7. Pipeline board (1:00)

**Click:** Pipeline.

**Point out:** columns from Prospect to Completed. Nomvula Khumalo at Offer Submitted, Pieter Steyn (a seller) in Negotiation, Sipho Ndlovu in Closing, Elena Rossi in Completed, Daniel Okafor in Lost.

**Click:** drag Nomvula's card from Offer Submitted to Negotiation.

**Say:** "Drag a card and the stage changes, with a timeline entry. The dashboard counts update from this."

## 8. Properties (1:00)

**Click:** Properties.

**Point out:** listings in every status: available, under offer, sold, withdrawn, a rental.

**Click:** **Family home on the slopes of Constantia**.

**Point out:** two buyers linked to the same listing: Michael Botha with a viewing scheduled for Saturday, Priya Reddy as Suggested. Private notes (show house dates, occupation) that clients never see.

**Click:** **Link client**, choose Lerato Dlamini, status Suggested, save.

## 8b. Workflows and drafts (2:30)

**Click:** Drafts in the sidebar (it shows a count of 3).

**Point out:** three messages written by a workflow when the Woodstock loft was added: a WhatsApp to Lerato (investor, Woodstock is on her list, price is in budget), and emails to Thandi and Ahmed. Each shows why the client was matched and a "check before sending" note.

**Click:** Send on Lerato's WhatsApp. It goes out (simulated in the demo) and lands on her timeline. Dismiss Thandi's; she wanted two bedrooms.

**Say:** "Nothing here was sent by a machine. The workflow found the matches and wrote the first draft; I stay in control of every send."

**Click:** Settings, then **Workflows**. Five workflows, each written as *when … only if … then …*: new listing → link and draft; new enquiry → notify and follow-up; gone quiet → nudge; sold → tell interested clients; offer accepted → bond follow-up (paused).

**Click:** **Start from a recipe** to show the starting points, then cancel. Open **Edit** on "New listing" to show the trigger, the condition (status is available) and the three actions.

**Click:** On "New listing", use **Try it** with "Sunlit two-bedroom with sea views" and press **Run now**. Then open Drafts: new drafts for the Sea Point buyers appear.

**Say:** "Triggers cover clients, properties, messages and time. Conditions can use any field. Actions include AI drafts, templates, notes, follow-ups, stage moves, property status and webhooks, so it plugs into other tools too."

**Click:** **Recent runs** at the bottom: every run is logged with what each step did.

## 8c. Custom pipeline (1:00)

**Click:** Settings, then **Pipeline**.

**Point out:** the stages in order, each with a group (Lead, Active, Transaction, Closed) and the number of clients in it.

**Click:** **Add stage**, name it "Bond Application", group Transaction, move it above Closing, **Save pipeline**. Open the Pipeline board: the new column is there. Reseed later to remove it.

**Say:** "The pipeline is yours: rename, reorder, add or remove stages. Groups keep the dashboard, board and colours working."

## 9. Settings: templates and auto-replies (1:30)

**Click:** Settings.

**Point out:** name, agency, phone and signature (this is what went on the end of the AI draft), time zone, currency, and business hours per day (the demo closes early on Fridays and does Saturday mornings).

**Click:** **Templates**. Five saved messages with placeholders like {{first_name}} and {{agent_phone}}. These are the "Insert template" options in the reply box.

**Click:** **Auto-replies**. Five rules:
- **Acknowledge new email enquiries**: first email from an unknown contact. This is the one that answered Thandi. It has triggered 14 times.
- **After-hours reply on WhatsApp**: outside the business hours set above.
- **Holiday reply (email)**: an away period with a start and end. Shows as Scheduled now; while the dates are active it says Away now, and afterwards Ended.
- **Weekend reply (WhatsApp)**: repeats every week, Friday 17:30 to Monday 08:00.
- **Viewing requests from clients**: keyword-based, currently switched off.

**Say:** "Rules are template-based and predictable. AI is only used for drafts I review. Nothing is sent by AI on its own."

**Click:** **Gmail** and **WhatsApp** settings pages briefly.

**Say:** "In production, Gmail connects with one Google sign-in and imports the last 30 days of mail. WhatsApp uses the official Business Cloud API. In this demo both are simulated."

## 10. Close (0:30)

**Say:** "To recap: one inbox for email and WhatsApp, a record and timeline for every client, a pipeline that runs off real conversations, properties linked to buyers, template auto-replies for the routine stuff, and AI drafts for the rest. To go live you need a Google sign-in, a WhatsApp Business account, an Anthropic API key for drafting, and a free-tier Postgres database. It deploys to Vercel in an afternoon."

## Likely questions

- **Does the AI send anything by itself?** No. AI only produces drafts that you edit and send. Auto-replies are fixed templates you wrote.
- **Can workflows send messages by themselves?** Only your own templates, and only if you add a "Send a template" action. Anything written by AI waits on the Drafts page for you.
- **What does AI drafting cost?** A few cents per draft at the default model; roughly half that with the smaller model. A busy month is a few dollars.
- **Where is my data?** In your own Postgres database (Neon free tier works). Gmail is accessed through Google's official OAuth; tokens are encrypted at rest. Attachments are never stored.
- **Can it match clients automatically?** Yes: incoming email and WhatsApp are matched to clients by address and phone number, including alternate ones. Unknown senders show as "Not a client" until you link them.
- **Multiple agents?** It's built for one agent per install. Each agent runs their own.
- **What if I don't have WhatsApp Business?** Email works on its own. WhatsApp can be added later.

## Reset

`npm run demo:seed` puts everything back, including unread counts.
