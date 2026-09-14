import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { autoReplyLog, autoReplyRules, templates, type AutoReplyRule, type Client, type Message, type Settings } from "@/lib/db/schema";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { logActivity } from "@/lib/messaging/activity";
import { renderTemplate, withSignature } from "./render";

export type AutoReplyContext = {
  channel: "email" | "whatsapp";
  message: Message;
  client: Client | null;
  isNewContact: boolean;
  settings: Settings;
  /** False for automated senders, bounces and other mail that must never receive a reply. */
  safeToReply: boolean;
};

export function ruleMatches(rule: AutoReplyRule, ctx: Omit<AutoReplyContext, "settings"> & { settings: Settings; now?: Date }): boolean {
  if (!rule.enabled || rule.channel !== ctx.channel) return false;
  if (rule.applyTo === "clients" && !ctx.client) return false;
  if (rule.applyTo === "unknown" && ctx.client) return false;
  if (rule.stages.length > 0 && (!ctx.client || !rule.stages.includes(ctx.client.stage))) return false;

  switch (rule.triggerType) {
    case "any":
      return true;
    case "new_contact":
      return ctx.isNewContact;
    case "keyword": {
      const haystack = `${ctx.message.subject ?? ""}\n${ctx.message.bodyText ?? ""}`.toLowerCase();
      return rule.keywords.some((keyword) => keyword.trim() && haystack.includes(keyword.trim().toLowerCase()));
    }
    case "outside_hours":
      return !isWithinBusinessHours(ctx.now ?? ctx.message.sentAt, ctx.settings.businessHours, ctx.settings.timezone);
    default:
      return false;
  }
}

async function inCooldown(rule: AutoReplyRule, message: Message): Promise<boolean> {
  const since = new Date(Date.now() - rule.cooldownHours * 3_600_000);
  const recent = await db.query.autoReplyLog.findFirst({
    where: and(
      eq(autoReplyLog.ruleId, rule.id),
      eq(autoReplyLog.contactAddress, message.contactAddress),
      gt(autoReplyLog.sentAt, since),
    ),
  });
  if (recent) return true;
  if (rule.oncePerThread && message.threadId) {
    const inThread = await db.query.autoReplyLog.findFirst({
      where: and(eq(autoReplyLog.ruleId, rule.id), eq(autoReplyLog.threadId, message.threadId)),
    });
    if (inThread) return true;
  }
  return false;
}

/**
 * Sends at most one predefined automatic reply for an inbound message.
 * Rules are evaluated in the agent's configured order; the first match wins.
 * Content comes exclusively from the agent's templates.
 */
export async function evaluateAutoReply(ctx: AutoReplyContext): Promise<void> {
  const { settings } = ctx;
  const enabled = ctx.channel === "email" ? settings.emailAutoRepliesEnabled : settings.whatsappAutoRepliesEnabled;
  if (!enabled || !ctx.safeToReply) return;

  const rules = await db.query.autoReplyRules.findMany({
    where: and(eq(autoReplyRules.channel, ctx.channel), eq(autoReplyRules.enabled, true)),
    orderBy: [asc(autoReplyRules.position), asc(autoReplyRules.createdAt)],
  });

  for (const rule of rules) {
    if (!ruleMatches(rule, ctx)) continue;
    if (await inCooldown(rule, ctx.message)) continue;

    const template = await db.query.templates.findFirst({ where: eq(templates.id, rule.templateId) });
    if (!template) continue;

    const renderContext = { client: ctx.client, contactName: ctx.message.contactName, settings };
    const body = renderTemplate(template.body, renderContext);

    try {
      let sentMessageId: string | null = null;
      if (ctx.channel === "email") {
        const { sendEmail } = await import("@/lib/gmail/send");
        const subject = template.subject
          ? renderTemplate(template.subject, renderContext)
          : ctx.message.subject
            ? `Re: ${ctx.message.subject.replace(/^re:\s*/i, "")}`
            : "Thank you for your message";
        const sent = await sendEmail({
          to: [{ name: ctx.message.contactName, address: ctx.message.contactAddress }],
          subject,
          text: withSignature(body, settings.emailSignature),
          clientId: ctx.client?.id ?? null,
          contactName: ctx.message.contactName,
          replyTo: {
            threadId: ctx.message.threadId,
            messageIdHeader: ctx.message.messageIdHeader,
            references: ctx.message.referencesHeader,
          },
          isAutoReply: true,
          autoReplyRuleId: rule.id,
        });
        sentMessageId = sent.id;
      } else {
        const { sendWhatsAppText } = await import("@/lib/whatsapp/send");
        const sent = await sendWhatsAppText({
          toPhone: ctx.message.contactAddress,
          text: body,
          clientId: ctx.client?.id ?? null,
          contactName: ctx.message.contactName,
          isAutoReply: true,
          autoReplyRuleId: rule.id,
        });
        sentMessageId = sent.id;
      }

      await db.insert(autoReplyLog).values({
        ruleId: rule.id,
        channel: ctx.channel,
        contactAddress: ctx.message.contactAddress,
        threadId: ctx.message.threadId,
        inboundMessageId: ctx.message.id,
        sentMessageId,
      });
      await db
        .update(autoReplyRules)
        .set({ timesTriggered: rule.timesTriggered + 1, lastTriggeredAt: new Date() })
        .where(eq(autoReplyRules.id, rule.id));
      if (ctx.client) {
        await logActivity({
          clientId: ctx.client.id,
          type: "auto_reply_sent",
          title: `Automatic ${ctx.channel === "email" ? "email" : "WhatsApp"} reply sent`,
          body: `Rule "${rule.name}" replied using the "${template.name}" template.`,
          metadata: { ruleId: rule.id, templateId: template.id },
        });
      }
    } catch (error) {
      console.error(`[auto-reply] Rule "${rule.name}" failed:`, error);
    }
    return;
  }
}
