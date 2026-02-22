import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { listMessages, getMessage } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  const accessToken = (session as Record<string, unknown> | null)?.accessToken as string | undefined

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const query      = searchParams.get('q')      ?? 'in:inbox'
    const maxResults = parseInt(searchParams.get('max') ?? '20', 10)
    const withBody   = searchParams.get('body') === 'true'

    const refs = await listMessages(accessToken, query, maxResults)
    const messages = await Promise.all(
      refs.slice(0, maxResults).map(r => getMessage(accessToken, r.id!))
    )

    const result = messages.map(m => ({
      id:       m.id,
      threadId: m.threadId,
      from:     m.from,
      to:       m.to,
      subject:  m.subject,
      snippet:  m.snippet,
      date:     m.date,
      ...(withBody ? { body: m.body } : {}),
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
