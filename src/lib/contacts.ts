/**
 * contacts.ts – read/write contacts to an Excel file using SheetJS
 */
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { Contact } from '@/types'

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.xlsx')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function readContacts(): Contact[] {
  ensureDataDir()
  if (!fs.existsSync(CONTACTS_FILE)) return []
  const wb = XLSX.readFile(CONTACTS_FILE)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
  return rows.map((r, i) => ({
    id:               r['ID']               ?? `c-${i}`,
    name:             r['Name']             ?? '',
    email:            r['Email']            ?? '',
    phone:            r['Phone']            ?? '',
    propertyInterest: r['Property Interest'] ?? '',
    notes:            r['Notes']            ?? '',
    dateAdded:        r['Date Added']       ?? '',
  }))
}

export function writeContacts(contacts: Contact[]) {
  ensureDataDir()
  const rows = contacts.map(c => ({
    'ID':                c.id,
    'Name':              c.name,
    'Email':             c.email,
    'Phone':             c.phone,
    'Property Interest': c.propertyInterest,
    'Notes':             c.notes,
    'Date Added':        c.dateAdded,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 18 },
    { wch: 28 }, { wch: 30 }, { wch: 14 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts')
  XLSX.writeFile(wb, CONTACTS_FILE)
}

export function addContact(contact: Omit<Contact, 'id' | 'dateAdded'>): Contact {
  const contacts = readContacts()
  const newContact: Contact = {
    ...contact,
    id: `c-${Date.now()}`,
    dateAdded: new Date().toISOString().split('T')[0],
  }
  writeContacts([...contacts, newContact])
  return newContact
}

export function deleteContact(id: string) {
  const contacts = readContacts().filter(c => c.id !== id)
  writeContacts(contacts)
}

export function importFromBuffer(buffer: Buffer): Contact[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)

  const existing = readContacts()
  const existingEmails = new Set(existing.map(c => c.email.toLowerCase()))

  const imported: Contact[] = []
  for (const r of rows) {
    const email = (r['Email'] ?? r['email'] ?? '').trim().toLowerCase()
    if (!email || existingEmails.has(email)) continue

    const contact: Contact = {
      id:               `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name:             r['Name']             ?? r['name']              ?? '',
      email,
      phone:            r['Phone']            ?? r['phone']             ?? r['Number'] ?? r['number'] ?? '',
      propertyInterest: r['Property Interest'] ?? r['propertyInterest'] ?? r['Property'] ?? '',
      notes:            r['Notes']            ?? r['notes']             ?? '',
      dateAdded:        new Date().toISOString().split('T')[0],
    }
    imported.push(contact)
    existingEmails.add(email)
  }

  writeContacts([...existing, ...imported])
  return imported
}

export function exportContactsBuffer(): Buffer {
  const contacts = readContacts()
  const rows = contacts.map(c => ({
    'ID':                c.id,
    'Name':              c.name,
    'Email':             c.email,
    'Phone':             c.phone,
    'Property Interest': c.propertyInterest,
    'Notes':             c.notes,
    'Date Added':        c.dateAdded,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 18 },
    { wch: 28 }, { wch: 30 }, { wch: 14 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
