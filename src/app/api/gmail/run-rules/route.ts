import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { readRules, readRepliedThreads, markThreadReplied, updateRule } from '@/lib/rules'
import { listMessages, getMessage, sendEmail } from '@/lib/gmail'

// POST /api/gmail/run-rules  → scan inbox and fire matching auto-reply rules
export async function POST() {
  const session = await getServerSession()
  const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const rules         = readRules().filter(r => r.enabled)
    const repliedThreads = readRepliedThreads()

    if (rules.length === 0) {
      return NextResponse.json({ processed: 0, replied: 0, message: 'No active rules' })
    }

    const msgs = await listMessages(accessToken, 'in:inbox', 50)
    let replied = 0

    for (const ref of msgs) {
      if (!ref.id) continue
      const msg = await getMessage(accessToken, ref.id)

      if (repliedThreads.has(msg.threadId)) continue

      for (const rule of rules) {
        const fromMatch    = msg.from.toLowerCase().includes(rule.fromEmail.toLowerCase())
        const subjectMatch = rule.subjectContains
          ? msg.subject.toLowerCase().includes(rule.subjectContains.toLowerCase())
          : true

        if (fromMatch && subjectMatch) {
          const fromEmail = extractEmail(msg.from)
          const fromName  = extractName(msg.from)

          const replyBody = rule.replyTemplate
            .replace(/\{\{name\}\}/gi,    fromName)
            .replace(/\{\{subject\}\}/gi, msg.subject)
            .replace(/\{\{email\}\}/gi,   fromEmail)

          await sendEmail(accessToken, {
            to:       fromEmail,
            subject:  rule.replySubject || `Re: ${msg.subject}`,
            body:     replyBody,
            threadId: msg.threadId,
          })

          markThreadReplied(msg.threadId)
          updateRule(rule.id, {
            repliesCount:  rule.repliesCount + 1,
            lastTriggered: new Date().toISOString(),
          })
          replied++
          break
        }
      }
    }

    return NextResponse.json({ processed: msgs.length, replied })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/)
  return match ? match[1] : from.trim()
}

function extractName(from: string): string {
  const match = from.match(/^(.+?)\s*</)
  return match ? match[1].replace(/"/g, '').trim() : from.split('@')[0]
}
