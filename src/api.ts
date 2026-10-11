// Thin typed wrappers around the FastAPI backend (proxied under /api by Vite).

export type Role = 'user' | 'assistant' | 'system-notification' | 'note' | 'quiz' | 'summary'

export interface ConversationSummary {
  id: number
  created_at: string
  preview: string | null
}

export interface Message {
  seq: number
  role: Role
  content: string
  created_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error('Impossible de joindre le serveur.')
  }
  if (!response.ok) {
    // FastAPI errors look like {"detail": "..."}.
    const body = await response.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : null
    throw new Error(detail ?? `Erreur ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function listConversations(): Promise<ConversationSummary[]> {
  return request('/conversations')
}

export async function createConversation(): Promise<number> {
  const { conversation_id } = await request<{ conversation_id: number }>('/conversations', {
    method: 'POST',
  })
  return conversation_id
}

export function getMessages(conversationId: number): Promise<Message[]> {
  return request(`/conversations/${conversationId}/messages`)
}

export interface ChatResult {
  reply: string
  notification: string | null // set when the backend also stored a system-notification
  summary: string | null
  quiz: string | null
}

export function sendMessage(conversationId: number, message: string): Promise<ChatResult> {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, message }),
  })
}

// Stores a personal note in the conversation. No LLM call: the note is never sent to the model.
export function addNote(conversationId: number, content: string): Promise<Message> {
  return request(`/conversations/${conversationId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export interface ModelsInfo {
  models: string[]
  default: string
}

export async function listModels(): Promise<ModelsInfo> {
  let response: Response
  try {
    response = await fetch('/api/models')
  } catch {
    throw new Error('Impossible de joindre le serveur.')
  }
  if (!response.ok) throw new Error(`Erreur ${response.status}`)
  return response.json() as Promise<ModelsInfo>
}

export interface StreamDone {
  reply: string
  notification: string | null
  summary: string | null
  quiz: string | null
}

// Envoie un message et lit la réponse au fil de l'eau (fetch + getReader : EventSource ne gère pas le POST).
// onDelta est appelé pour chaque morceau de texte. La promesse se résout quand le tour est enregistré en base,
// et échoue (Error) si le backend signale une erreur : dans ce cas rien n'a été enregistré.
export async function streamMessage(
  conversationId: number,
  message: string,
  model: string | null,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamDone> {
  let response: Response
  try {
    response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, message, model }),
      signal,
    })
  } catch {
    throw new Error('Impossible de joindre le serveur.')
  }
  if (!response.ok || !response.body) {
    // Erreurs FastAPI classiques (400 modèle refusé, 404 conversation...) : {"detail": "..."}
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : `Erreur ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done: StreamDone | null = null

  const handle = (block: string) => {
    if (!block.startsWith('data:')) return
    const event = JSON.parse(block.slice(5).trim())
    if (event.error) throw new Error(event.error)
    if (event.delta) onDelta(event.delta)
    if (event.done) done = event as StreamDone
  }

  while (true) {
    const { value, done: finished } = await reader.read()
    if (finished) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    blocks.forEach(handle)
  }
  if (buffer.trim()) handle(buffer.trim())
  if (!done) throw new Error('La réponse a été interrompue.')
  return done
}