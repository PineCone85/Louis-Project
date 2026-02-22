'use client'
import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { MailOpen, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface Email {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
  body?: string
}

export default function InboxPage() {
  const { status } = useSession()
  const [emails, setEmails]     = useState<Email[]>([])
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery]       = useState('in:inbox')

  const load = async () => {
    setLoading(true)
    const res  = await fetch(`/api/gmail/inbox?q=${encodeURIComponent(query)}&max=30`)
    const data = await res.json()
    setEmails(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { if (status === 'authenticated') load() }, [status]) // eslint-disable-line

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    // Lazy-load body if not yet fetched
    setEmails(prev => prev.map(e =>
      e.id === id && !e.body ? { ...e, body: '…loading…' } : e
    ))
    const res  = await fetch(`/api/gmail/inbox?q=rfc822msgid:${id}&max=1&body=true`)
    const data = await res.json()
    if (Array.isArray(data) && data[0]) {
      setEmails(prev => prev.map(e => e.id === id ? { ...e, ...data[0] } : e))
    }
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-500">Please connect your Gmail to view your inbox.</p>
        <button onClick={() => signIn('google')} className="btn-primary">Connect Gmail</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MailOpen className="w-6 h-6 text-sky-600" />
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-56 text-sm"
            placeholder='e.g. from:client@example.com'
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
          <button onClick={load} disabled={loading} className="btn-primary text-xs">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
        </div>
      ) : emails.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No emails found.</div>
      ) : (
        <div className="space-y-2">
          {emails.map(email => (
            <div key={email.id} className="card p-0 overflow-hidden">
              <button
                className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(email.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-gray-900 text-sm truncate">{email.from}</span>
                    <span className="text-xs text-gray-400 shrink-0">{new Date(email.date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5 truncate">{email.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{email.snippet}</p>
                </div>
                {expanded === email.id
                  ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                }
              </button>
              {expanded === email.id && (
                <div className="px-5 pb-4 border-t border-gray-100">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-3 font-sans leading-relaxed max-h-64 overflow-y-auto">
                    {email.body ?? email.snippet}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
