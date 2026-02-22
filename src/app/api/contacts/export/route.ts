import { NextResponse } from 'next/server'
import { exportContactsBuffer } from '@/lib/contacts'

export async function GET() {
  const buffer = exportContactsBuffer()
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="contacts.xlsx"',
    },
  })
}
