import { NextRequest, NextResponse } from 'next/server'
import { importFromBuffer } from '@/lib/contacts'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      return NextResponse.json({ error: 'Only .xlsx, .xls, .csv files are supported' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const imported = importFromBuffer(buffer)

    return NextResponse.json({ imported: imported.length, contacts: imported })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
