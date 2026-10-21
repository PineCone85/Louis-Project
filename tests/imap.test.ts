import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccount, EmailSyncState, Settings } from "@/lib/db/schema";

process.env.AUTH_SECRET ??= "test-secret-for-imap-tests-0123456789";

const DAY = 86_400_000;
const known = new Set<string>();
const ingested: Array<{ id: string; historical: boolean; kind: string; subject: string }> = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [...known].map((externalId) => ({ externalId })),
      }),
    }),
  },
}));
vi.mock("@/lib/email/accounts", () => ({
  updateEmailAccount: vi.fn(async (_id: string, values: Partial<EmailAccount>) => {
    Object.assign(current, values);
  }),
  updateSyncState: async (account: EmailAccount, patch: EmailSyncState) => {
    account.syncState = { ...account.syncState, imap: { ...account.syncState.imap, ...patch.imap } };
    return account.syncState;
  },
}));
vi.mock("@/lib/messaging/ingest", () => ({
  ingestEmail: vi.fn(async (input: { parsed: { id: string; labelIds: string[]; subject: string }; historical: boolean }) => {
    ingested.push({ id: input.parsed.id, historical: input.historical, kind: input.parsed.labelIds[0], subject: input.parsed.subject });
    return { message: null, created: true, client: null };
  }),
}));

type FakeMessage = { uid: number; date: Date; raw: Buffer; flags?: string[] };
type FakeFolder = { uidValidity: bigint; uidNext: number; messages: FakeMessage[] };
let folders: Record<string, FakeFolder>;

function rawEmail(subject: string, date: Date, extra = ""): Buffer {
  return Buffer.from(
    [
      "From: Jane Client <jane@example.com>",
      "To: Louis <louis@rize.co.za>",
      `Subject: ${subject}`,
      `Date: ${date.toUTCString()}`,
      `Message-ID: <${subject.replace(/\W+/g, "-")}@example.com>`,
      extra,
      "Content-Type: text/plain; charset=utf-8",
      "",
      `Body of ${subject}`,
      "",
    ]
      .filter((line, i) => line !== "" || i > 5)
      .join("\r\n"),
  );
}

function expand(set: string): number[] {
  return set.split(",").flatMap((part) => {
    const [a, b] = part.split(":").map(Number);
    if (b === undefined) return [a];
    const out: number[] = [];
    for (let n = a; n <= b; n += 1) out.push(n);
    return out;
  });
}

function fakeClient() {
  let open: FakeFolder | null = null;
  return {
    get mailbox() {
      return open ? { uidValidity: open.uidValidity, uidNext: open.uidNext, exists: open.messages.length } : false;
    },
    async getMailboxLock(path: string, options: { readOnly?: boolean }) {
      expect(options.readOnly).toBe(true);
      open = folders[path];
      return { path, release: () => (open = null) };
    },
    async search(query: { uid?: string; since?: Date; all?: boolean }) {
      let list = open!.messages;
      if (query.uid) {
        const [from, to] = query.uid.split(":");
        const max = Math.max(0, ...list.map((m) => m.uid));
        const upper = to === "*" ? max : Number(to);
        list = list.filter((m) => m.uid >= Math.min(Number(from), upper) && m.uid <= upper);
        if (to === "*" && list.length === 0 && max > 0) list = open!.messages.filter((m) => m.uid === max);
      }
      if (query.since) list = list.filter((m) => m.date >= query.since!);
      return list.map((m) => m.uid);
    },
    async fetchAll(set: string) {
      const wanted = new Set(expand(set));
      return open!.messages
        .filter((m) => wanted.has(m.uid))
        .map((m) => ({ uid: m.uid, seq: m.uid, size: m.raw.length, source: m.raw, internalDate: m.date, flags: new Set(m.flags ?? []) }));
    },
  };
}

vi.mock("@/lib/imap/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imap/client")>()),
  credentialsFor: () => ({ username: "louis@rize.co.za", password: "pw", imap: { host: "mail.test", port: 993, secure: true }, smtp: { host: "mail.test", port: 465, secure: true } }),
  connectImap: async () => fakeClient(),
  closeImap: async () => undefined,
  findSentFolder: async () => ("INBOX.Sent" in folders ? "INBOX.Sent" : null),
}));

let current: EmailAccount;

function account(syncState: EmailSyncState = {}, connectedAt = new Date()): EmailAccount {
  return {
    id: "acc-1",
    provider: "imap",
    emailAddress: "louis@rize.co.za",
    displayName: null,
    refreshTokenEnc: "",
    accessTokenEnc: null,
    accessTokenExpiresAt: null,
    scopes: "",
    syncState,
    serverConfig: null,
    watchId: null,
    watchExpiresAt: null,
    backfillCompletedAt: null,
    syncLockedAt: null,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncErrorAt: null,
    connectedAt,
    updatedAt: new Date(),
  } as EmailAccount;
}

function ctx(exhausted: () => boolean = () => false) {
  return {
    settings: {} as Settings,
    budget: { get exhausted() { return exhausted(); } },
    stats: { processed: 0, created: 0 },
    selfAddresses: ["louis@rize.co.za"],
  } as unknown as import("@/lib/email/sync").ProviderSyncContext;
}

beforeEach(() => {
  known.clear();
  ingested.length = 0;
  const now = Date.now();
  folders = {
    INBOX: {
      uidValidity: 111n,
      uidNext: 4,
      messages: [
        { uid: 1, date: new Date(now - 40 * DAY), raw: rawEmail("Too old", new Date(now - 40 * DAY)) },
        { uid: 2, date: new Date(now - 10 * DAY), raw: rawEmail("Ten days", new Date(now - 10 * DAY)) },
        { uid: 3, date: new Date(now - 2 * DAY), raw: rawEmail("Two days", new Date(now - 2 * DAY)) },
      ],
    },
    "INBOX.Sent": { uidValidity: 222n, uidNext: 2, messages: [{ uid: 1, date: new Date(now - 5 * DAY), raw: rawEmail("Sent reply", new Date(now - 5 * DAY)) }] },
  };
});

describe("syncImapAccount", () => {
  it("imports the last 30 days newest first on connection, then only new mail", async () => {
    const { syncImapAccount } = await import("@/lib/imap/sync");
    current = account();
    await syncImapAccount(current, ctx());

    expect(ingested.map((m) => m.subject)).toEqual(["Two days", "Ten days", "Sent reply"]);
    expect(ingested.every((m) => m.historical)).toBe(true);
    expect(ingested.map((m) => m.kind)).toEqual(["INBOX", "INBOX", "SENT"]);
    expect(ingested[0].id).toBe("imap:acc-1:inbox:111:3");
    expect(current.syncState.imap?.inbox).toMatchObject({ path: "INBOX", uidValidity: "111", liveFromUid: 4, lastUid: 3, backfillDone: true });
    expect(current.syncState.imap?.sent).toMatchObject({ path: "INBOX.Sent", backfillDone: true });
    expect(current.backfillCompletedAt).toBeInstanceOf(Date);

    ingested.length = 0;
    const inbox = folders.INBOX;
    inbox.messages.push({ uid: 4, date: new Date(), raw: rawEmail("Brand new", new Date()) });
    inbox.uidNext = 5;
    await syncImapAccount(current, ctx());
    expect(ingested).toEqual([{ id: "imap:acc-1:inbox:111:4", historical: false, kind: "INBOX", subject: "Brand new" }]);
    expect(current.syncState.imap?.inbox?.lastUid).toBe(4);

    // Nothing new: the folder is not searched again and nothing is ingested.
    ingested.length = 0;
    await syncImapAccount(current, ctx());
    expect(ingested).toEqual([]);
  });

  it("delivers new mail even when there is no time left for the import", async () => {
    const { syncImapAccount } = await import("@/lib/imap/sync");
    current = account();
    // The first sync only sets up the cursors.
    await syncImapAccount(current, ctx(() => Boolean(current.syncState.imap?.sent)));
    expect(ingested).toEqual([]);
    expect(current.syncState.imap?.inbox?.backfillDone).toBe(false);

    folders.INBOX.messages.push({ uid: 4, date: new Date(), raw: rawEmail("Arrived later", new Date()) });
    folders.INBOX.uidNext = 5;
    await syncImapAccount(current, ctx(() => ingested.length > 0));
    expect(ingested.map((m) => m.subject)).toEqual(["Arrived later"]);
    expect(current.syncState.imap?.inbox?.backfillDone).toBe(false);

    ingested.length = 0;
    await syncImapAccount(current, ctx());
    expect(ingested.map((m) => m.subject)).toEqual(["Two days", "Ten days", "Sent reply"]);
  });

  it("skips drafts, deleted and already stored messages but still moves past them", async () => {
    const { syncImapAccount } = await import("@/lib/imap/sync");
    current = account();
    await syncImapAccount(current, ctx());
    ingested.length = 0;

    const now = new Date();
    folders.INBOX.messages.push(
      { uid: 4, date: now, raw: rawEmail("Draft", now), flags: ["\\Draft"] },
      { uid: 5, date: now, raw: rawEmail("Deleted", now), flags: ["\\Deleted"] },
      { uid: 6, date: now, raw: rawEmail("Stored", now) },
      { uid: 7, date: now, raw: rawEmail("Fresh", now) },
    );
    folders.INBOX.uidNext = 8;
    known.add("imap:acc-1:inbox:111:6");
    await syncImapAccount(current, ctx());
    expect(ingested.map((m) => m.subject)).toEqual(["Fresh"]);
    expect(current.syncState.imap?.inbox?.lastUid).toBe(7);
  });

  it("starts the folder again when the server renumbers it", async () => {
    const { syncImapAccount } = await import("@/lib/imap/sync");
    current = account();
    await syncImapAccount(current, ctx());
    ingested.length = 0;

    folders.INBOX = { uidValidity: 999n, uidNext: 3, messages: [{ uid: 2, date: new Date(Date.now() - DAY), raw: rawEmail("Two days", new Date(Date.now() - 2 * DAY)) }] };
    await syncImapAccount(current, ctx());
    expect(current.syncState.imap?.inbox).toMatchObject({ uidValidity: "999", liveFromUid: 3, backfillDone: true });
    // Re-imported under its new id; ingestion recognises it by Message-ID and does not store it twice.
    expect(ingested.map((m) => m.id)).toEqual(["imap:acc-1:inbox:999:2"]);
  });

  it("works without a sent folder", async () => {
    const { syncImapAccount } = await import("@/lib/imap/sync");
    delete (folders as Record<string, FakeFolder | undefined>)["INBOX.Sent"];
    current = account();
    await syncImapAccount(current, ctx());
    expect(ingested.map((m) => m.subject)).toEqual(["Two days", "Ten days"]);
    expect(current.backfillCompletedAt).toBeInstanceOf(Date);
  });
});

describe("uidSet and batches", () => {
  it("compacts UIDs into ranges and bounds batches", async () => {
    const { uidSet, batches } = await import("@/lib/imap/sync");
    expect(uidSet([9, 3, 4, 5, 12, 7, 13, 14])).toBe("3:5,7,9,12:14");
    const uids = Array.from({ length: 23 }, (_, i) => i + 1);
    expect(batches(uids, new Map()).map((b) => b.length)).toEqual([10, 10, 3]);
    const sizes = new Map([[1, 5_000_000], [2, 5_000_000], [3, 100]]);
    expect(batches([1, 2, 3], sizes)).toEqual([[1], [2, 3]]);
  });
});

describe("parseMessageSource", () => {
  const source = Buffer.from(
    [
      "From: \"Jane Client\" <Jane@Example.com>",
      "To: Louis <louis@rize.co.za>, Team: a@example.com, b@example.com;",
      "Cc: Office <office@rize.co.za>",
      "Subject: =?UTF-8?B?UmU6IFZpZXdpbmcg4oCTIFNhdHVyZGF5?=",
      "Date: Sat, 17 Oct 2026 09:00:00 +0200",
      "Message-ID: <reply@example.com>",
      "In-Reply-To: <second@rize.co.za>",
      "References: <first@rize.co.za> <second@rize.co.za>",
      "List-Unsubscribe: <mailto:x@example.com>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="b1"',
      "",
      "--b1",
      'Content-Type: multipart/related; boundary="b2"',
      "",
      "--b2",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>Saturday works &amp; thanks</p><img src="cid:logo@x">',
      "--b2",
      "Content-Type: image/png",
      "Content-ID: <logo@x>",
      "Content-Disposition: inline",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--b2--",
      "--b1",
      'Content-Type: application/pdf; name="offer.pdf"',
      'Content-Disposition: attachment; filename="offer.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      "JVBERi0xLjQ=",
      "--b1--",
      "",
    ].join("\r\n"),
  );

  it("maps addresses, threading, headers and file attachments", async () => {
    const { parseMessageSource } = await import("@/lib/imap/parse");
    const received = new Date("2026-10-17T07:01:00Z");
    const parsed = await parseMessageSource(source, { id: "imap:acc-1:inbox:1:5", kind: "inbox", receivedAt: received });

    expect(parsed.from).toEqual({ name: "Jane Client", address: "jane@example.com" });
    expect(parsed.to.map((a) => a.address)).toEqual(["louis@rize.co.za", "a@example.com", "b@example.com"]);
    expect(parsed.cc).toEqual([{ name: "Office", address: "office@rize.co.za" }]);
    expect(parsed.subject).toBe("Re: Viewing – Saturday");
    expect(parsed.threadId).toBe("<first@rize.co.za>");
    expect(parsed.inReplyTo).toBe("<second@rize.co.za>");
    expect(parsed.messageIdHeader).toBe("<reply@example.com>");
    expect(parsed.headers["list-unsubscribe"]).toBe("<mailto:x@example.com>");
    expect(parsed.text).toContain("Saturday works & thanks");
    expect(parsed.html).toContain("<p>Saturday works");
    expect(parsed.attachments).toEqual([{ attachmentId: "part-0", filename: "offer.pdf", mimeType: "application/pdf", size: 8 }]);
    expect(parsed.labelIds).toEqual(["INBOX"]);
    expect(parsed.sentAt).toEqual(received);
  });

  it("dates sent mail by its Date header and starts a thread at its own Message-ID", async () => {
    const { parseMessageSource } = await import("@/lib/imap/parse");
    const parsed = await parseMessageSource(rawEmail("Fresh start", new Date("2026-10-01T10:00:00Z")), { id: "x", kind: "sent", receivedAt: new Date("2026-10-02T00:00:00Z") });
    expect(parsed.labelIds).toEqual(["SENT"]);
    expect(parsed.sentAt).toEqual(new Date("2026-10-01T10:00:00Z"));
    expect(parsed.threadId).toBe("<Fresh-start@example.com>");
  });

  it("round-trips external ids", async () => {
    const { imapExternalId, parseImapExternalId } = await import("@/lib/imap/parse");
    expect(parseImapExternalId(imapExternalId("0f5e-uuid", "sent", "123", 45))).toEqual({ accountId: "0f5e-uuid", kind: "sent", uidValidity: "123", uid: 45 });
    expect(parseImapExternalId("imap:acc:outbox:<x@y>")).toBeNull();
  });
});

describe("mail-server settings", () => {
  it("fills in the usual servers and ports", async () => {
    const { resolveMailServerConfig } = await import("@/lib/imap/connect");
    expect(resolveMailServerConfig({ emailAddress: "Louis@Rize.co.za", password: "x", imapSecurity: "ssl", smtpSecurity: "ssl" })).toEqual({
      username: "louis@rize.co.za",
      imap: { host: "mail.rize.co.za", port: 993, secure: true },
      smtp: { host: "mail.rize.co.za", port: 465, secure: true },
    });
    expect(
      resolveMailServerConfig({ emailAddress: "a@b.com", password: "x", imapHost: "Imap.Host.net", smtpHost: "smtp.host.net", imapSecurity: "starttls", smtpSecurity: "starttls", smtpPort: 2525 }),
    ).toEqual({ username: "a@b.com", imap: { host: "imap.host.net", port: 143, secure: false }, smtp: { host: "smtp.host.net", port: 2525, secure: false } });
  });

  it("explains common connection failures", async () => {
    const { describeMailServerError } = await import("@/lib/imap/client");
    const cert = Object.assign(new Error("Hostname/IP does not match certificate's altnames: Host: mail.rize.co.za. is not in the cert's altnames: DNS:dedi319.nur4.host-h.net"), {
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    expect(describeMailServerError(cert, "IMAP", "mail.rize.co.za").message).toContain("Use dedi319.nur4.host-h.net as the IMAP server");
    const smtpCert = Object.assign(new Error("Hostname/IP does not match certificate's altnames: Host: smtp.rize.co.za. is not in the cert's altnames: DNS:dedi319.nur4.host-h.net"), { code: "ESOCKET" });
    expect(describeMailServerError(smtpCert, "SMTP", "smtp.rize.co.za").message).toContain("Use dedi319.nur4.host-h.net as the SMTP server");
    const auth = describeMailServerError(Object.assign(new Error("Command failed"), { authenticationFailed: true }), "IMAP", "mail.rize.co.za");
    expect(auth.passwordRejected).toBe(true);
    expect(describeMailServerError(Object.assign(new Error("x"), { code: "ENOTFOUND" }), "SMTP", "smtp.rize.co.za").message).toContain("does not exist");
  });
});
