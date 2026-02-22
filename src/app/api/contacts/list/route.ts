import { NextResponse } from 'next/server'
import { readContacts } from '@/lib/contacts'

export async function GET() {
  return NextResponse.json(readContacts())
}
