import { describe, expect, it } from "vitest";
import { extractLeadDetails, parseAmount, stripQuotedReply } from "@/lib/email/lead-details";
import { htmlToText } from "@/lib/email/html";
import { leadFieldsForClient } from "@/lib/messaging/lead";
import type { Client } from "@/lib/db/schema";

const extract = (text: string, subject = "") => extractLeadDetails({ text, subject, defaultCountry: "ZA" });

describe("extractLeadDetails", () => {
  it("reads a personal enquiry written in prose", () => {
    const d = extract(
      "Hi Louis\n\nWe are looking to buy a 3 bedroom house in Durbanville, our budget is between R2.5m and R3.2 million. " +
        "Please call me on 082 123 4567.\n\nThanks\nJane",
    );
    expect(d.phone).toBe("+27821234567");
    expect(d.budgetMin).toBe(2_500_000);
    expect(d.budgetMax).toBe(3_200_000);
    expect(d.clientType).toBe("buyer");
    expect(d.message).toContain("3 bedroom house in Durbanville");
  });

  it("reads a website contact form", () => {
    const d = extract(
      [
        "New enquiry from your website",
        "",
        "Name: Jane van der Merwe",
        "Email: jane@example.com",
        "Cell number: +27 (0)83 555 1234",
        "Alternative number: 021 555 9876",
        "Looking to: Rent",
        "Preferred area: Sea Point, Green Point",
        "Budget: R15 000 - R18 000",
        "Bedrooms: 2",
        "Pets: 1 cat",
        "Message:",
        "Hi, we need a place from 1 February.",
        "Pet friendly please.",
      ].join("\n"),
    );
    expect(d.firstName).toBe("Jane");
    expect(d.lastName).toBe("van der Merwe");
    expect(d.phone).toBe("+27835551234");
    expect(d.alternatePhone).toBe("+27215559876");
    expect(d.clientType).toBe("tenant");
    expect(d.preferredAreas).toBe("Sea Point, Green Point");
    expect(d.budgetMin).toBe(15_000);
    expect(d.budgetMax).toBe(18_000);
    expect(d.requirements).toBe("Bedrooms: 2\nPets: 1 cat");
    expect(d.message).toBe("Hi, we need a place from 1 February.\nPet friendly please.");
  });

  it("reads a form laid out as an HTML table", () => {
    const text = htmlToText(
      "<table><tr><td>Name</td><td>Sipho Dlamini</td></tr><tr><td>Phone</td><td>0721234567</td></tr><tr><td>Suburb</td><td>Fourways</td></tr></table>",
    );
    const d = extract(text);
    expect(d.firstName).toBe("Sipho");
    expect(d.phone).toBe("+27721234567");
    expect(d.preferredAreas).toBe("Fourways");
  });

  it("recognises sellers and landlords", () => {
    expect(extract("Good day, I would like a valuation as we are thinking of selling our home.").clientType).toBe("seller");
    expect(extract("I have a flat in Claremont and want to rent out my property.").clientType).toBe("landlord");
  });

  it("ignores the quoted conversation and listing references", () => {
    const d = extract("Yes please, Saturday works.\n\nOn Tue, 10 Nov 2026 at 10:00, Louis <louis@agency.co.za> wrote:\n> Call me on 082 999 8888\n> Ref 123456789");
    expect(d.phone).toBeNull();
    expect(d.message).toBe("Yes please, Saturday works.");
  });

  it("does not mistake a listing reference or price for a phone number", () => {
    const d = extract("I saw listing 113245678 for R1 950 000 on Property24, is it still available?");
    expect(d.phone).toBeNull();
  });
});

describe("parseAmount", () => {
  it("understands South African notation", () => {
    expect(parseAmount("2.5m")).toBe(2_500_000);
    expect(parseAmount("2,5 million")).toBe(2_500_000);
    expect(parseAmount("2 500 000")).toBe(2_500_000);
    expect(parseAmount("850k")).toBe(850_000);
    expect(parseAmount("3")).toBeNull();
  });
});

describe("stripQuotedReply", () => {
  it("cuts Outlook-style quotes", () => {
    expect(stripQuotedReply("Thanks!\n\nFrom: Louis\nSent: Monday\nTo: Jane\nSubject: Re: viewing")).toBe("Thanks!");
  });
});

describe("leadFieldsForClient", () => {
  const details = extract("Name: Jane\nPhone: 082 123 4567\nArea: Constantia\nBudget: up to R4m\nMessage: Looking to buy");

  it("fills everything for a new client", () => {
    const fields = leadFieldsForClient(details, null, { subject: "House in Constantia", sentAt: new Date("2026-11-10T08:00:00Z") });
    expect(fields).toMatchObject({ phone: "+27821234567", preferredAreas: "Constantia", budgetMax: 4_000_000, clientType: "buyer" });
    expect(fields.notes).toBe('Enquiry "House in Constantia" (2026-11-10):\nLooking to buy');
  });

  it("never overwrites what the agent entered", () => {
    const existing = { phone: "+27831111111", alternatePhone: null, preferredAreas: "Bishopscourt", budgetMin: null, budgetMax: null, requirements: null, clientType: "seller", notes: "VIP" } as unknown as Client;
    const fields = leadFieldsForClient(details, existing, { subject: null, sentAt: null });
    expect(fields.phone).toBeUndefined();
    expect(fields.alternatePhone).toBe("+27821234567");
    expect(fields.preferredAreas).toBeUndefined();
    expect(fields.clientType).toBeUndefined();
    expect(fields.budgetMax).toBe(4_000_000);
    expect(fields.notes).toBe("VIP\n\nEnquiry:\nLooking to buy");
    // Running it again adds nothing new.
    const again = leadFieldsForClient(details, { ...existing, ...fields } as Client, { subject: null, sentAt: null });
    expect(again).toEqual({});
  });
});
