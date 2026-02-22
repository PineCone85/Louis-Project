import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { readContacts } from '@/lib/contacts'
import { sendEmail } from '@/lib/gmail'

// POST /api/gmail/send-bulk
// Body: { subject, body, contactIds: string[] | 'all' }
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { subject, body, contactIds } = await req.json() as {
      subject: string
      body: string
      contactIds: string[] | 'all'
    }

    if (!subject || !body) {
      return NextResponse.json({ error: 'subject and body are required' }, { status: 400 })
    }

    const allContacts = readContacts()
    const targets = contactIds === 'all'
      ? allContacts
      : allContacts.filter(c => (contactIds as string[]).includes(c.id))

    if (targets.length === 0) {
      return NextResponse.json({ error: 'No contacts matched' }, { status: 400 })
    }

    const results: { email: string; success: boolean; error?: string }[] = []

    for (const contact of targets) {
      if (!contact.email) continue
      try {
        const personalBody = body
          .replace(/\{\{name\}\}/gi,             contact.name)
          .replace(/\{\{email\}\}/gi,            contact.email)
          .replace(/\{\{phone\}\}/gi,            contact.phone)
          .replace(/\{\{propertyInterest\}\}/gi, contact.propertyInterest)

        await sendEmail(accessToken, {
          to:      contact.email,
          subject: subject.replace(/\{\{name\}\}/gi, contact.name),
          body:    personalBody,
        })
        results.push({ email: contact.email, success: true })
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error'
        results.push({ email: contact.email, success: false, error: errMsg })
      }
    }

    const sent   = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    return NextResponse.json({ sent, failed, results })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
