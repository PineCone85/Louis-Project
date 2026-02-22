/**
 * rules.ts – persist auto-reply rules as JSON on disk
 */
import fs from 'fs'
import path from 'path'
import { AutoReplyRule } from '@/types'

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
const RULES_FILE = path.join(DATA_DIR, 'rules.json')
const REPLIED_FILE = path.join(DATA_DIR, 'replied_threads.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function readRules(): AutoReplyRule[] {
  ensureDataDir()
  if (!fs.existsSync(RULES_FILE)) return []
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'))
}

export function writeRules(rules: AutoReplyRule[]) {
  ensureDataDir()
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2))
}

export function addRule(rule: Omit<AutoReplyRule, 'id' | 'repliesCount' | 'createdAt'>): AutoReplyRule {
  const rules = readRules()
  const newRule: AutoReplyRule = {
    ...rule,
    id: `rule-${Date.now()}`,
    repliesCount: 0,
    createdAt: new Date().toISOString(),
  }
  writeRules([...rules, newRule])
  return newRule
}

export function updateRule(id: string, updates: Partial<AutoReplyRule>) {
  const rules = readRules().map(r => r.id === id ? { ...r, ...updates } : r)
  writeRules(rules)
}

export function deleteRule(id: string) {
  writeRules(readRules().filter(r => r.id !== id))
}

// Track which thread IDs have already been auto-replied
export function readRepliedThreads(): Set<string> {
  ensureDataDir()
  if (!fs.existsSync(REPLIED_FILE)) return new Set()
  const arr: string[] = JSON.parse(fs.readFileSync(REPLIED_FILE, 'utf-8'))
  return new Set(arr)
}

export function markThreadReplied(threadId: string) {
  const set = readRepliedThreads()
  set.add(threadId)
  ensureDataDir()
  fs.writeFileSync(REPLIED_FILE, JSON.stringify([...set], null, 2))
}
