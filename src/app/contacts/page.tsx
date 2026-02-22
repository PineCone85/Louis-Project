'use client'
import { useEffect, useState, useRef } from 'react'
import { useSession, signIn } from 'next-auth/react'
import {
  Users, Plus, Upload, Download, Trash2, Search, X, Save
} from 'lucide-react'
import type { Contact } from '@/types'

const EMPTY_FORM = {
  name: '', email: '', phone: '', propertyInterest: '', notes: '',
}

export default function ContactsPage() {
  const { status } = useSession()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    const res  = await fetch('/api/contacts/list')
    const data = await res.json()
    setContacts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { if (status === 'authenticated') load() }, [status])

  const filtered = contacts.filter(c =>
    [c.name, c.email, c.phone, c.propertyInterest].some(
      v => v.toLowerCase().includes(search.toLowerCase())
    )
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/contacts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm(EMPTY_FORM)
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contact?')) return
    await fetch(`/api/contacts/delete?id=${id}`, { method: 'DELETE' })
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('')
    const fd = new FormData()
    fd.append('file', file)
    const res  = await fetch('/api/contacts/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) {
      setUploadMsg(`✓ Imported ${data.imported} new contact(s)`)
      await load()
    } else {
      setUploadMsg(`✗ ${data.error}`)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-gray-500">Please connect your Gmail to use this page.</p>
        <button onClick={() => signIn('google')} className="btn-primary">Connect Gmail</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-sky-600" />
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <span className="badge-blue">{contacts.length}</span>
        </div>
        <div className="flex gap-2">
          <a href="/api/contacts/export" download="contacts.xlsx" className="btn-secondary text-xs">
            <Download className="w-4 h-4" /> Export Excel
          </a>
          <label className={`btn-secondary text-xs cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Importing…' : 'Import Excel'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
          </label>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary text-xs">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        </div>
      </div>

      {uploadMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${uploadMsg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {uploadMsg}
        </div>
      )}

      {/* Add Contact Form */}
      {showForm && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">New Contact</h2>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'name',             label: 'Full Name',          placeholder: 'John Smith'            },
              { key: 'email',            label: 'Email *',            placeholder: 'john@example.com'      },
              { key: 'phone',            label: 'Phone',              placeholder: '+44 7700 900000'        },
              { key: 'propertyInterest', label: 'Property Interest',  placeholder: '3-bed semi, SW London'  },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  required={key === 'email'}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="Any additional notes…"
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save Contact'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search by name, email, phone or property…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          {contacts.length === 0 ? 'No contacts yet. Import an Excel file or add one manually.' : 'No contacts match your search.'}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Email', 'Phone', 'Property Interest', 'Date Added', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.propertyInterest || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.dateAdded}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
