'use client'
import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Send, Users, CheckSquare, Square } from 'lucide-react'
import type { Contact } from '@/types'

const TEMPLATE = `Hi {{name}},

I hope this message finds you well. I wanted to reach out as we have some exciting new properties available that match your interests in {{propertyInterest}}.

Please let me know if you'd like to arrange a viewing or discuss any of these opportunities.

Kind regards,
[Your Name]`

export default function BulkEmailPage() {
  const { status } = useSession()
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [subject, setSubject]     = useState('New Property Listings — Just for You')
  const [body, setBody]           = useState(TEMPLATE)
  const [sending, setSending]     = useState(false)
  const [result, setResult]       = useState<{ sent: number; failed: number } | null>(null)
  const [search, setSearch]       = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/contacts/list').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setContacts(d)
    })
  }, [status])

  const filtered = contacts.filter(c =>
    [c.name, c.email, c.propertyInterest].some(v => v.toLowerCase().includes(search.toLowerCase()))
  )

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    if (selected.size === 0) return alert('Select at least one contact.')
    if (!subject || !body)   return alert('Subject and body are required.')
    if (!confirm(`Send to ${selected.size} contact(s)?`)) return

    setSending(true)
    setResult(null)
    const res  = await fetch('/api/gmail/send-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, contactIds: [...selected] }),
    })
    const data = await res.json()
    setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 })
    setSending(false)
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-500">Please connect your Gmail to send bulk emails.</p>
        <button onClick={() => signIn('google')} className="btn-primary">Connect Gmail</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Send className="w-6 h-6 text-sky-600" />
        <h1 className="text-2xl font-bold text-gray-900">Bulk Email</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: compose */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Compose Message</h2>
            <p className="text-xs text-gray-400 mb-3">
              Personalise with <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{email}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{phone}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{propertyInterest}}'}</code>
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Subject</label>
                <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="label">Message body</label>
                <textarea
                  className="input resize-y font-mono text-xs"
                  rows={12}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            className="btn-primary w-full justify-center py-3"
          >
            <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
            {sending ? 'Sending…' : `Send to ${selected.size} contact${selected.size === 1 ? '' : 's'}`}
          </button>

          {result && (
            <div className={`p-4 rounded-lg text-sm border ${result.failed === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
              ✓ Sent: <strong>{result.sent}</strong> &nbsp;|&nbsp; Failed: <strong>{result.failed}</strong>
            </div>
          )}
        </div>

        {/* Right: contact picker */}
        <div className="card p-0 overflow-hidden flex flex-col max-h-[680px]">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="font-semibold text-sm text-gray-900">Select Recipients</span>
              {selected.size > 0 && <span className="badge-blue">{selected.size}</span>}
            </div>
            <button onClick={toggleAll} className="btn-secondary text-xs py-1">
              {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="px-4 py-2 border-b border-gray-100">
            <input
              className="input text-sm"
              placeholder="Filter contacts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No contacts found.</p>
            ) : filtered.map(c => (
              <label
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                {selected.has(c.id)
                  ? <CheckSquare className="w-4 h-4 text-sky-600 shrink-0" />
                  : <Square className="w-4 h-4 text-gray-300 shrink-0" />
                }
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name || c.email}</p>
                  <p className="text-xs text-gray-400 truncate">{c.email}{c.propertyInterest ? ` · ${c.propertyInterest}` : ''}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
