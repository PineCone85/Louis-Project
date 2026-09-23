import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, type Message } from "@/lib/db/schema";

export type Conversation = {
  key: string;
  channel: "email" | "whatsapp";
  contactAddress: string;
  contactName: string | null;
  clientId: string | null;
  clientName: string | null;
  clientStage: string | null;
  lastMessage: Pick<Message, "id" | "direction" | "subject" | "snippet" | "sentAt" | "mediaType" | "isAutoReply">;
  unreadCount: number;
  messageCount: number;
};

/**
 * Lists conversations grouped per contact and channel, most recent first.
 * Conversations for known clients carry the client's name and stage.
 * With `clientsOnly`, conversations from contacts not linked to a client are hidden.
 */
export async function listConversations(options: { unreadOnly?: boolean; channel?: string; clientsOnly?: boolean; limit?: number } = {}): Promise<Conversation[]> {
  const limit = options.limit ?? 200;
  const result = await db.execute(sql`
    with latest as (
      select distinct on (m.channel, m.contact_address)
        m.id, m.channel, m.contact_address, m.client_id, m.contact_name, m.direction, m.subject, m.snippet, m.sent_at, m.media_type, m.is_auto_reply
      from messages m
      order by m.channel, m.contact_address, m.sent_at desc
    ),
    counts as (
      select channel, contact_address,
        count(*)::int as message_count,
        count(*) filter (where direction = 'inbound' and read_at is null)::int as unread_count,
        max(contact_name) filter (where contact_name is not null) as any_name
      from messages
      group by channel, contact_address
    )
    select l.id, l.channel, l.contact_address, l.client_id, coalesce(l.contact_name, c.any_name) as contact_name,
      l.direction, l.subject, l.snippet, l.sent_at, l.media_type, l.is_auto_reply,
      c.message_count, c.unread_count,
      cl.first_name, cl.last_name, cl.stage
    from latest l
    join counts c on c.channel = l.channel and c.contact_address = l.contact_address
    left join clients cl on cl.id = l.client_id
    where 1 = 1
      ${options.unreadOnly ? sql`and c.unread_count > 0` : sql``}
      ${options.channel ? sql`and l.channel = ${options.channel}` : sql``}
      ${options.clientsOnly ? sql`and l.client_id is not null` : sql``}
    order by l.sent_at desc
    limit ${limit}
  `);

  type Row = {
    id: string;
    channel: "email" | "whatsapp";
    contact_address: string;
    client_id: string | null;
    contact_name: string | null;
    direction: "inbound" | "outbound";
    subject: string | null;
    snippet: string | null;
    sent_at: Date | string;
    media_type: string | null;
    is_auto_reply: boolean;
    message_count: number;
    unread_count: number;
    first_name: string | null;
    last_name: string | null;
    stage: string | null;
  };

  return (result.rows as Row[]).map((row) => ({
    key: `${row.channel}:${row.contact_address}`,
    channel: row.channel,
    contactAddress: row.contact_address,
    contactName: row.contact_name,
    clientId: row.client_id,
    clientName: row.first_name ? `${row.first_name} ${row.last_name ?? ""}`.trim() : null,
    clientStage: row.stage,
    lastMessage: {
      id: row.id,
      direction: row.direction,
      subject: row.subject,
      snippet: row.snippet,
      sentAt: new Date(row.sent_at),
      mediaType: row.media_type,
      isAutoReply: row.is_auto_reply,
    },
    unreadCount: row.unread_count,
    messageCount: row.message_count,
  }));
}

export async function getConversationMessages(channel: string, contactAddress: string): Promise<Message[]> {
  return db.query.messages.findMany({
    where: and(eq(messages.channel, channel), eq(messages.contactAddress, contactAddress)),
    orderBy: [asc(messages.sentAt)],
    limit: 300,
  });
}

export async function getMessage(id: string): Promise<Message | null> {
  const row = await db.query.messages.findFirst({ where: eq(messages.id, id) });
  return row ?? null;
}

export async function markClientMessagesRead(clientId: string): Promise<void> {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.clientId, clientId), eq(messages.direction, "inbound"), isNull(messages.readAt)));
}

export async function markConversationRead(channel: string, contactAddress: string): Promise<void> {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.channel, channel),
        eq(messages.contactAddress, contactAddress),
        eq(messages.direction, "inbound"),
        isNull(messages.readAt),
      ),
    );
}

export async function countUnreadInbound(): Promise<{ total: number; email: number; whatsapp: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      email: sql<number>`count(*) filter (where ${messages.channel} = 'email')::int`,
      whatsapp: sql<number>`count(*) filter (where ${messages.channel} = 'whatsapp')::int`,
    })
    .from(messages)
    .where(and(eq(messages.direction, "inbound"), isNull(messages.readAt)));
  return { total: row?.total ?? 0, email: row?.email ?? 0, whatsapp: row?.whatsapp ?? 0 };
}

/** Latest inbound email in a thread, used to build a correctly threaded reply. */
export async function latestEmailInThread(threadId: string): Promise<Message | null> {
  const row = await db.query.messages.findFirst({
    where: and(eq(messages.channel, "email"), eq(messages.threadId, threadId)),
    orderBy: [desc(messages.sentAt)],
  });
  return row ?? null;
}

export async function recentInboundMessages(limit = 8): Promise<Message[]> {
  return db.query.messages.findMany({
    where: eq(messages.direction, "inbound"),
    orderBy: [desc(messages.sentAt)],
    limit,
  });
}
