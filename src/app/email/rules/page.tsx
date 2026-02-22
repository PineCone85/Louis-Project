'use client'
import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Mail, Plus, Trash2, ToggleLeft, ToggleRight, X, Save, RefreshCw } from 'lucide-react'
import type { AutoReplyRule } from '@/types'

const EMPTY = {
  fromEmail: '',
  subjectContains: '',
  replySubject: '',
  replyTemplate: `Hi {{name}},

Thank you for your email regarding {{subject}}.

I'll get back to you shortly with more information about available properties.

Best regards,
[Your Name]`,
  enabled: true,
}

export default function RulesPage() {
  const { status } = useSession()
  const [rules, setRules]     = useState<AutoReplyRule[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg]   = useState('')

  const load = async () => {
    const res  = await fetch('/api/gmail/auto-reply')
    const data = await res.json()
    setRules(Array.isArray(data) ? data : [])
  }

  useEffect(() => { if (status === 'authenticated') load() }, [status])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/gmail/auto-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm(EMPTY)
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return
    await fetch(`/api/gmail/auto-reply?id=${id}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const toggleEnabled = async (rule: AutoReplyRule) => {
    await fetch(`/api/gmail/auto-reply?id=${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
  }

  const handleRunNow = async () => {
    setRunning(true)
    setRunMsg('')
    const res  = await fetch('/api/gmail/run-rules', { method: 'POST' })
    const data = await res.json()
    setRunMsg(data.error ? `✗ ${data.error}` : `✓ Scanned ${data.processed} emails, sent ${data.replied} auto-repl${data.replied === 1 ? 'y' : 'ies'}`)
    setRunning(false)
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-500">Please connect your Gmail to manage auto-reply rules.</p>
        <button onClick={() => signIn('google')} className="btn-primary">Connect Gmail</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-sky-600" />
          <h1 className="text-2xl font-bold text-gray-900">Auto-Reply Rules</h1>
          <span className="badge-blue">{rules.length}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRunNow} disabled={running} className="btn-secondary text-xs">
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : 'Run Now'}
          </button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" /> New Rule
          </button>
        </div>
      </div>

      {runMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${runMsg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {runMsg}
        </div>
      )}

      {/* Rule Form */}
      {showForm && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">New Auto-Reply Rule</h2>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Reply when email is from *</label>
                <input
                  className="input"
                  placeholder="client@example.com"
                  value={form.fromEmail}
                  onChange={e => setForm(p => ({ ...p, fromEmail: e.target.value }))}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Partial match — e.g. "@gmail.com" to match any Gmail sender.</p>
              </div>
              <div>
                <label className="label">Subject contains (optional)</label>
                <input
                  className="input"
                  placeholder="viewing request"
                  value={form.subjectContains}
                  onChange={e => setForm(p => ({ ...p, subjectContains: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label">Reply subject (leave blank to use "Re: …")</label>
              <input
                className="input"
                placeholder="Re: Your Property Enquiry"
                value={form.replySubject}
                onChange={e => setForm(p => ({ ...p, replySubject: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Reply template *</label>
              <p className="text-xs text-gray-400 mb-1">
                Use <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{email}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{subject}}'}</code> as placeholders.
              </p>
              <textarea
                className="input resize-y font-mono text-xs"
                rows={8}
                value={form.replyTemplate}
                onChange={e => setForm(p => ({ ...p, replyTemplate: e.target.value }))}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          No rules yet. Create one to start auto-replying.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">From:</span>
                    <code className="bg-sky-50 text-sky-800 text-xs px-2 py-0.5 rounded">{rule.fromEmail}</code>
                    {rule.subjectContains && (
                      <>
                        <span className="text-gray-400 text-xs">subject contains</span>
                        <code className="bg-violet-50 text-violet-800 text-xs px-2 py-0.5 rounded">{rule.subjectContains}</code>
                      </>
                    )}
                    {rule.enabled ? <span className="badge-green">Active</span> : <span className="badge-red">Paused</span>}
                  </div>
                  {rule.replySubject && (
                    <p className="text-xs text-gray-500 mt-1">Reply subject: <em>{rule.replySubject}</em></p>
                  )}
                  <pre className="text-xs text-gray-600 mt-2 bg-gray-50 rounded p-2 whitespace-pre-wrap line-clamp-3 font-sans leading-relaxed max-h-20 overflow-hidden">
                    {rule.replyTemplate}
                  </pre>
                  <p className="text-xs text-gray-400 mt-2">
                    {rule.repliesCount} repl{rule.repliesCount === 1 ? 'y' : 'ies'} sent
                    {rule.lastTriggered && ` · Last: ${new Date(rule.lastTriggered).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleEnabled(rule)} title={rule.enabled ? 'Pause' : 'Enable'}>
                    {rule.enabled
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />
                    }
                  </button>
                  <button onClick={() => handleDelete(rule.id)}>
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
