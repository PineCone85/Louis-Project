export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  propertyInterest: string
  notes: string
  dateAdded: string
}

export interface AutoReplyRule {
  id: string
  fromEmail: string
  subjectContains?: string
  replySubject: string
  replyTemplate: string
  enabled: boolean
  repliesCount: number
  createdAt: string
  lastTriggered?: string
}

export interface EmailMessage {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  snippet: string
  date: string
  body?: string
}

export interface BulkEmailPayload {
  subject: string
  body: string
  contactIds: string[]
}
