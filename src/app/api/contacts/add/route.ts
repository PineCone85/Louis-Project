import { NextRequest, NextResponse } from 'next/server'
import { addContact } from '@/lib/contacts'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, propertyInterest, notes } = body

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const contact = addContact({
      name:             (name             ?? '').trim(),
      email:            email.trim().toLowerCase(),
      phone:            (phone            ?? '').trim(),
      propertyInterest: (propertyInterest ?? '').trim(),
      notes:            (notes            ?? '').trim(),
    })
    return NextResponse.json(contact, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
