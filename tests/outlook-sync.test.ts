import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccount, EmailSyncState, Settings } from "@/lib/db/schema";

process.env.AUTH_SECRET ??= "test-secret-for-outlook-tests-0123456789";

const known = new Set<string>();
const ingested: Array<{ id: string; historical: boolean; kind: string }> = [];

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
  getValidAccessToken: async () => "access-token",
  updateEmailAccount: vi.fn(async (_id: string, values: Partial<EmailAccount>) => {
    Object.assign(current, values);
  }),
  updateSyncState: async (account: EmailAccount, patch: EmailSyncState) => {
    account.syncState = { ...account.syncState, outlook: { ...account.syncState.outlook, ...patch.outlook } };
    return account.syncState;
  },
}));
vi.mock("@/lib/messaging/ingest", () => ({
  ingestEmail: vi.fn(async (input: { parsed: { id: string; labelIds: string[] }; historical: boolean }) => {
    ingested.push({ id: input.parsed.id, historical: input.historical, kind: input.parsed.labelIds[0] });
    return { message: null, created: true, client: null };
  }),
}));

let current: EmailAccount;
const requested: string[] = [];

function account(syncState: EmailSyncState, connectedAt = new Date(Date.now() - 10 * 86_400_000)): EmailAccount {
  return {
    id: "acc-1",
    provider: "outlook",
    emailAddress: "agent@outlook.com",
    displayName: null,
    refreshTokenEnc: "",
    accessTokenEnc: null,
    accessTokenExpiresAt: null,
    scopes: "",
    syncState,
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

function ctx(budgetMs = 30_000) {
  const deadline = Date.now() + budgetMs;
  return {
    settings: {} as Settings,
    budget: { get exhausted() { return Date.now() >= deadline; } },
    stats: { processed: 0, created: 0 },
    selfAddresses: ["agent@outlook.com"],
  } as unknown as import("@/lib/email/sync").ProviderSyncContext;
}

beforeEach(() => {
  known.clear();
  ingested.length = 0;
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      requested.push(url);
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      const folder = url.includes("/mailFolders/inbox/") ? "inbox" : "sent";
      if (url.includes("/messages/delta")) {
        if (url.includes("$deltatoken=")) return json({ value: [] });
        return json({ value: [{ id: `${folder}-new` }], "@odata.deltaLink": `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta?$deltatoken=t` });
      }
      if (url.includes("/mailFolders/") && url.includes("receivedDateTime lt")) {
        return json({ value: [{ id: `${folder}-old-1` }, { id: `${folder}-old-2` }] });
      }
      const message = url.match(/\/me\/messages\/([^?/]+)\?/);
      if (message) {
        const id = message[1];
        const old = id.includes("old");
        const stamp = new Date(Date.now() - (old ? 20 : 0) * 86_400_000).toISOString();
        return json({ id, conversationId: id, from: { emailAddress: { address: "client@example.com" } }, receivedDateTime: stamp, sentDateTime: stamp, isDraft: false });
      }
      return json({ value: [] });
    }),
  );
});

describe("syncOutlookAccount", () => {
  it("follows new mail before importing history, and skips messages already stored", async () => {
    const { syncOutlookAccount } = await import("@/lib/outlook/sync");
    current = account({ outlook: {} });
    known.add("inbox-old-2");
    await syncOutlookAccount(current, ctx());

    const firstHistory = requested.findIndex((u) => u.includes("receivedDateTime lt"));
    const lastLive = requested.map((u) => u.includes("/messages/delta")).lastIndexOf(true);
    expect(lastLive).toBeGreaterThanOrEqual(0);
    expect(lastLive).toBeLessThan(firstHistory);
    expect(requested.find((u) => u.includes("/mailFolders/inbox/messages/delta"))).toContain(`receivedDateTime ge ${current.syncState.outlook?.liveSince?.slice(0, 19)}`);

    expect(ingested.map((m) => m.id)).toEqual(["inbox-new", "sent-new", "inbox-old-1", "sent-old-1", "sent-old-2"]);
    expect(ingested.find((m) => m.id === "inbox-old-1")?.historical).toBe(true);
    expect(current.syncState.outlook).toMatchObject({ inboxReady: true, sentReady: true, inboxBackfillDone: true, sentBackfillDone: true });
    expect(current.backfillCompletedAt).toBeInstanceOf(Date);
  });

  it("still delivers new mail when there is no time left for the history import", async () => {
    const { syncOutlookAccount } = await import("@/lib/outlook/sync");
    current = account({ outlook: {} });
    const context = ctx();
    // Exhaust the budget as soon as the live cursors are ready.
    const original = Object.getOwnPropertyDescriptor(context, "budget")!;
    Object.defineProperty(context, "budget", {
      get: () => ({ get exhausted() { return Boolean(current.syncState.outlook?.sentReady); } }),
    });
    await syncOutlookAccount(current, context);
    Object.defineProperty(context, "budget", original);

    expect(ingested.map((m) => m.id)).toEqual(["inbox-new", "sent-new"]);
    expect(current.syncState.outlook?.inboxBackfillDone).toBe(false);
  });

  it("migrates a mailbox stuck in the earlier single-cursor import", async () => {
    const { syncOutlookAccount } = await import("@/lib/outlook/sync");
    current = account({
      outlook: {
        inboxLink: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$skiptoken=stuck",
        inboxReady: false,
        sentLink: "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages/delta?$deltatoken=old",
        sentReady: true,
      },
    });
    await syncOutlookAccount(current, ctx());

    expect(requested.some((u) => u.includes("skiptoken=stuck"))).toBe(false);
    expect(requested.some((u) => u.includes("deltatoken=old"))).toBe(true);
    expect(current.syncState.outlook).toMatchObject({ inboxReady: true, sentReady: true, inboxBackfillDone: true, sentBackfillDone: true });
    // The finished sent folder is not imported again.
    expect(ingested.map((m) => m.id)).toEqual(["inbox-new", "inbox-old-1", "inbox-old-2"]);
  });
});
