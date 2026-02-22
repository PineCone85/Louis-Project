'use client'
import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Users, Mail, MailCheck, Send, Building2, LogIn, RefreshCw } from 'lucide-react'
import Link from 'next/link'

interface Stats {
  contacts: number
  rules: number
  activeRules: number
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [stats, setStats]   = useState<Stats>({ contacts: 0, rules: 0, activeRules: 0 })
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ processed: number; replied: number } | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    const load = async () => {
      const [cRes, rRes] = await Promise.all([
        fetch('/api/contacts/list'),
        fetch('/api/gmail/auto-reply'),
      ])
      const contacts = await cRes.json()
      const rules    = await rRes.json()
      setStats({
        contacts:    Array.isArray(contacts) ? contacts.length : 0,
        rules:       Array.isArray(rules)    ? rules.length    : 0,
        activeRules: Array.isArray(rules)    ? rules.filter((r: { enabled: boolean }) => r.enabled).length : 0,
      })
    }
    load()
  }, [status])

  const handleRunRules = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res  = await fetch('/api/gmail/run-rules', { method: 'POST' })
      const data = await res.json()
      setRunResult(data)
    } finally {
      setRunning(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
        <Building2 className="w-16 h-16 text-sky-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Estate Agent Hub</h1>
          <p className="text-gray-500 max-w-md">
            Connect your Gmail account to start managing contacts, scanning your inbox,
            setting up auto-reply rules, and sending bulk emails.
          </p>
        </div>
        <button onClick={() => signIn('google')} className="btn-primary text-base px-6 py-3">
          <LogIn className="w-5 h-5" /> Connect with Gmail
        </button>
      </div>
    )
  }

  const statCards = [
    { label: 'Total Contacts', value: stats.contacts,    icon: Users,      href: '/contacts',    color: 'text-sky-600'   },
    { label: 'Auto-Reply Rules', value: stats.rules,      icon: Mail,       href: '/email/rules', color: 'text-violet-600' },
    { label: 'Active Rules',     value: stats.activeRules, icon: MailCheck, href: '/email/rules', color: 'text-green-600'  },
    { label: 'Send Bulk Email', value: '→',               icon: Send,       href: '/email/bulk',  color: 'text-orange-600' },
  ]

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Good morning{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''} 👋
      </h1>
      <p className="text-gray-500 mb-8">Here's what's happening with your real estate leads.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, href, color }) => (
          <Link key={href + label} href={href} className="card hover:shadow-md transition-shadow">
            <Icon className={`w-8 h-8 mb-3 ${color}`} />
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRunRules}
            disabled={running}
            className="btn-primary"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Scanning…' : 'Run Auto-Reply Now'}
          </button>
          <Link href="/contacts" className="btn-secondary">
            <Users className="w-4 h-4" /> Manage Contacts
          </Link>
          <Link href="/email/bulk" className="btn-secondary">
            <Send className="w-4 h-4" /> Send Bulk Email
          </Link>
        </div>

        {runResult && (
          <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            ✓ Scanned <strong>{runResult.processed}</strong> emails — sent <strong>{runResult.replied}</strong> auto-repl{runResult.replied === 1 ? 'y' : 'ies'}.
          </div>
        )}
      </div>
    </div>
  )
}
