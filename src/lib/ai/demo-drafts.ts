import type { Draft, DraftRequest } from "./draft";

/**
 * Canned drafts used when AI_DRAFT_DEMO=true (the demo environment). They are
 * keyed on the conversation's contact address so the "Draft with AI" button
 * produces a believable reply for the seeded demo clients without calling the
 * Anthropic API. Anything not listed gets a generic draft.
 */
const DEMO_NOTE = "Demo mode: this draft is pre-written. With an Anthropic API key configured, Claude writes it live from the client record, linked properties and the full thread.";

type DemoDraft = Omit<Draft, "notes"> & { notes?: string };

const EMAIL_DRAFTS: Record<string, DemoDraft> = {
  "thandi.mokoena@example.com": {
    subject: "",
    body: `Hi Thandi

Thank you for your enquiry, and congratulations on the pre-approval. That puts you in a strong position.

I have one apartment that fits your brief closely: a north-facing two-bedroom on Beach Road in Sea Point at R2,950,000, with sea views over the promenade, secure basement parking and a 24-hour concierge. Levies are R2,850 and rates R1,120 per month. I've attached the brochure.

With your lease ending in December we should move quickly. Are you free to view this week, perhaps [suggest two times]? I can also line up one or two options in Green Point on the same day.

Warm regards
Sam`,
    notes: "Confirm two viewing times before sending, and attach the HV-2041 brochure.",
  },
  "priya.reddy@example.com": {
    subject: "",
    body: `Hi Priya

Just following up on Saturday. The Silverhurst Avenue viewing is confirmed for 10:00, and I've secured a second home in Newlands for 11:30. I'll send the address on Friday morning.

Two quick questions so I can prepare: would you and Dev like to see the study configured as a home office, and should I ask about the dogs' access to the garden, given the pool?

Looking forward to Saturday.

Kind regards
Sam`,
    notes: "The follow-up for Priya is overdue. Confirm the Newlands address is locked in before promising 11:30.",
  },
  "michael.botha@example.com": {
    subject: "",
    body: `Hi Michael

Good news on the appliances: the sellers are willing to leave the built-in oven, hob and dishwasher, so Sarah can plan around them. I'll bring the kitchen extension plans and the pool compliance certificate on Saturday as promised.

Rates, as mentioned, are R2,340 per month.

See you both at 10:00.

Kind regards
Sam`,
    notes: "Only send once the sellers have actually confirmed the appliances. Change the wording if they haven't.",
  },
  "nomvula.k@example.com": {
    subject: "",
    body: `Hi Nomvula

That's great to hear about the bank. A bond assessment already in progress puts us in a strong position when the seller responds.

No news from the seller yet, but they have until Friday close of business. The moment I hear anything I'll call you first, before anything goes in writing.

Fingers firmly crossed.

Kind regards
Sam`,
  },
  "sipho.ndlovu@example.com": {
    subject: "",
    body: `Hi Sipho

Well done on signing. From here the attorneys lodge the transfer at the Deeds Office once the rates clearance and transfer duty receipt are in, which is usually within two to three weeks. Registration then takes roughly two to four weeks after lodgement.

Realistically you should have the keys in about [estimate, e.g. five to seven] weeks. I'll confirm the lodgement date with Van Wyk & Partners and let you know.

Kind regards
Sam`,
    notes: "Fill in the timing estimate after speaking to the transfer attorneys.",
  },
  "pieter.steyn@example.com": {
    subject: "",
    body: `Hi Pieter

A quick update: the buyer's agent has acknowledged your counter of R1,060,000 with the unconditional 30-day terms and has until Thursday to respond. I've made it clear that you're comfortable waiting for the summer market if it doesn't work.

I'll be in touch on Thursday either way.

Kind regards
Sam`,
  },
  "hello@foyer.demo": {
    subject: "",
    body: `Hi there

Thanks for the tour. I'm working through each section now.

Sam`,
    notes: "This sender is not a client. Link it or create a client from the box above the thread before replying.",
  },
};

const WHATSAPP_DRAFTS: Record<string, DemoDraft> = {
  "+27825550102": {
    subject: "",
    body: "No problem at all, James. That Saturday works well. I'll set up three viewings for the morning: the Pinelands townhouse if it's still available, plus two pet-friendly homes in Rondebosch and Claremont. I'll confirm times by Wednesday. Safe travels down!",
    notes: "Check whether the Pinelands townhouse is still available after Friday's offer deadline.",
  },
  "+27825550104": {
    subject: "",
    body: "Sending the AGM minutes now. Tuesday 17:30 it is, I'll confirm with the tenant and send you the address. If the numbers still work after the viewing, I can have an offer drafted the same evening.",
  },
  "+27825550107": {
    subject: "",
    body: "Understood, Ahmed. A written offer at R2,85m is the right move; verbal numbers don't get taken seriously. I'll draft the offer to purchase this afternoon and send it for you to review tonight. One question: do you want a 30-day bond clause, or is this cash?",
    notes: "Confirm whether Ahmed is buying cash or with a bond before drafting the offer.",
  },
  "+27825550110": {
    subject: "",
    body: "Hi Chloe, yes, one month's rent as deposit, held in our trust account. I'll bring the lease on Thursday so you can read it properly. See you at 17:00!",
  },
  "+27825550199": {
    subject: "",
    body: "Hi Zanele, thanks for your message! Yes, the Woodstock loft (HV-2045) is still for sale at R1,450,000. It's tenanted, so viewings are weekday evenings. Would Tuesday or Wednesday at 17:30 suit you? I'll also send you the brochure and levy details.",
    notes: "This number is not linked to a client yet. Create a client from the conversation first so the reply is saved to their timeline.",
  },
};

function generic(request: DraftRequest): DemoDraft {
  if (request.channel === "whatsapp") {
    return { subject: "", body: "Hi, thanks for your message. I'll come back to you shortly with the details. Sam" };
  }
  return {
    subject: "Following up",
    body: `Hi

Thank you for your message. I'll come back to you shortly with the details you asked for.

Kind regards
Sam`,
  };
}

/** Returns a pre-written draft for the demo environment, after a short pause so the UI feels real. */
export async function demoDraft(request: DraftRequest): Promise<Draft> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const table = request.channel === "email" ? EMAIL_DRAFTS : WHATSAPP_DRAFTS;
  const found = table[request.contactAddress.toLowerCase()] ?? generic(request);
  const notes = [found.notes, DEMO_NOTE];
  if (request.instruction?.trim()) notes.unshift(`Your instruction ("${request.instruction.trim()}") would steer a live draft; demo drafts are fixed.`);
  return { subject: found.subject, body: found.body, notes: notes.filter(Boolean).join(" ") };
}
