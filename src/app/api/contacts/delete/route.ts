import { NextRequest, NextResponse } from 'next/server'
import { deleteContact } from '@/lib/contacts'

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteContact(id)
  return NextResponse.json({ ok: true })
}
