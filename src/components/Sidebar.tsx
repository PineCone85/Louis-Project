'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signIn, signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Mail,
  MailOpen,
  Send,
  LogIn,
  LogOut,
  Building2,
} from 'lucide-react'

const navItems = [
  { href: '/',               label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/contacts',       label: 'Contacts',    icon: Users },
  { href: '/email/inbox',    label: 'Inbox',       icon: MailOpen },
  { href: '/email/rules',    label: 'Auto-Reply',  icon: Mail },
  { href: '/email/bulk',     label: 'Bulk Email',  icon: Send },
]

export default function Sidebar() {
  const pathname  = usePathname()
  const { data: session, status } = useSession()

  return (
    <aside className="flex flex-col w-64 bg-gray-900 text-gray-100 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <Building2 className="w-7 h-7 text-sky-400" />
        <span className="font-bold text-lg tracking-tight">Estate Hub</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-gray-700">
        {status === 'authenticated' && session?.user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {session.user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.image} alt="avatar" className="w-8 h-8 rounded-full" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{session.user.name}</p>
                <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('google')}
            className="btn-primary w-full justify-center text-xs"
          >
            <LogIn className="w-4 h-4" /> Connect Gmail
          </button>
        )}
      </div>
    </aside>
  )
}
