/**
 * gmail.ts – thin wrappers around the Gmail REST API
 * Uses the raw access token stored by NextAuth in the session.
 */
import { google } from 'googleapis'

function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth })
}

/** Decode a Gmail base64url encoded body part */
function decodeBody(data?: string | null): string {
  if (!data) return ''
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

/** Extract a header value from a message */
function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** List recent emails from inbox matching an optional query */
export async function listMessages(accessToken: string, query = 'in:inbox', maxResults = 20) {
  const gmail = getGmailClient(accessToken)
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  })
  return res.data.messages ?? []
}

/** Fetch a single message with full body */
export async function getMessage(accessToken: string, messageId: string) {
  const gmail = getGmailClient(accessToken)
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })
  const msg = res.data
  const headers = msg.payload?.headers ?? []
  const from    = getHeader(headers, 'From')
  const to      = getHeader(headers, 'To')
  const subject = getHeader(headers, 'Subject')
  const date    = getHeader(headers, 'Date')

  // Extract body – prefer text/plain, fall back to text/html snippet
  let body = ''
  const parts = msg.payload?.parts ?? []
  if (parts.length > 0) {
    const plain = parts.find(p => p.mimeType === 'text/plain')
    body = decodeBody(plain?.body?.data ?? parts[0]?.body?.data)
  } else {
    body = decodeBody(msg.payload?.body?.data)
  }

  return {
    id:       msg.id ?? messageId,
    threadId: msg.threadId ?? '',
    from,
    to,
    subject,
    snippet:  msg.snippet ?? '',
    date,
    body,
  }
}

/** Send an email (new or as reply to a thread) */
export async function sendEmail(
  accessToken: string,
  opts: {
    to: string
    subject: string
    body: string
    threadId?: string
    inReplyTo?: string
  }
) {
  const gmail = getGmailClient(accessToken)

  const headers = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
  ].join('\n')

  const raw = Buffer.from(`${headers}\n\n${opts.body}`)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    },
  })
  return res.data
}

/** Apply auto-reply rules against recent inbox messages */
export async function runAutoReplyRules(
  accessToken: string,
  rules: import('@/types').AutoReplyRule[],
  repliedThreads: Set<string>
) {
  const activeRules = rules.filter(r => r.enabled)
  if (activeRules.length === 0) return { processed: 0, replied: 0 }

  const msgs = await listMessages(accessToken, 'in:inbox is:unread', 50)
  let replied = 0

  for (const ref of msgs) {
    if (!ref.id) continue
    const msg = await getMessage(accessToken, ref.id)

    // Skip if already replied
    if (repliedThreads.has(msg.threadId)) continue

    for (const rule of activeRules) {
      const fromMatch = msg.from.toLowerCase().includes(rule.fromEmail.toLowerCase())
      const subjectMatch = rule.subjectContains
        ? msg.subject.toLowerCase().includes(rule.subjectContains.toLowerCase())
        : true

      if (fromMatch && subjectMatch) {
        const replyBody = rule.replyTemplate
          .replace(/{{name}}/gi, extractName(msg.from))
          .replace(/{{subject}}/gi, msg.subject)
          .replace(/{{email}}/gi, extractEmail(msg.from))

        await sendEmail(accessToken, {
          to: extractEmail(msg.from),
          subject: rule.replySubject || `Re: ${msg.subject}`,
          body: replyBody,
          threadId: msg.threadId,
        })
        replied++
        break // only one rule per email
      }
    }
  }

  return { processed: msgs.length, replied }
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from.trim()
}

function extractName(from: string): string {
  const match = from.match(/^(.+?)\s*</)
  return match ? match[1].replace(/"/g, '').trim() : from.split('@')[0]
}
