import { NextRequest, NextResponse } from 'next/server'
import { readRules, addRule, updateRule, deleteRule } from '@/lib/rules'

// GET  /api/gmail/auto-reply  → list all rules
export async function GET() {
  return NextResponse.json(readRules())
}

// POST /api/gmail/auto-reply  → create a new rule
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { fromEmail, subjectContains, replySubject, replyTemplate, enabled } = body

  if (!fromEmail || !replyTemplate) {
    return NextResponse.json({ error: 'fromEmail and replyTemplate are required' }, { status: 400 })
  }

  const rule = addRule({
    fromEmail:        fromEmail.trim(),
    subjectContains:  subjectContains?.trim() || undefined,
    replySubject:     (replySubject ?? '').trim(),
    replyTemplate:    replyTemplate.trim(),
    enabled:          enabled ?? true,
  })
  return NextResponse.json(rule, { status: 201 })
}

// PATCH /api/gmail/auto-reply?id=xxx  → update a rule
export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates = await req.json()
  updateRule(id, updates)
  return NextResponse.json({ ok: true })
}

// DELETE /api/gmail/auto-reply?id=xxx  → remove a rule
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteRule(id)
  return NextResponse.json({ ok: true })
}
