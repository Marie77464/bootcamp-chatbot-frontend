import { useEffect, useState } from 'react'
import './App.css'
import {
  addNote,
  createConversation,
  getMessages,
  listConversations,
  listModels,
  streamMessage,
  type ConversationSummary,
} from './api'
import ChatWindow, { type ChatMessage } from './components/ChatWindow'
import Sidebar from './components/Sidebar'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.'
}

export default function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Models offered by the backend (list defined on the server); '' = let the backend use its default.
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')

  // On startup, load the history and open the most recent conversation.
  useEffect(() => {
    listConversations()
      .then((list) => {
        setConversations(list)
        if (list.length > 0) setActiveId(list[0].id)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  // Load the allowed models once; the backend's default is preselected.
  useEffect(() => {
    listModels()
      .then((info) => {
        setModels(info.models)
        setModel(info.default)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  // Load the messages whenever another conversation is opened.
  useEffect(() => {
    if (activeId === null) return
    let cancelled = false
    getMessages(activeId)
      .then((list) => {
        if (!cancelled) setMessages(list.map(({ role, content }) => ({ role, content })))
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [activeId])

  function selectConversation(id: number) {
    if (loading || savingNote || id === activeId) return
    setError(null)
    setDraft('')
    setMessages([])
    setActiveId(id)
  }

  async function handleNew() {
    if (loading || savingNote) return
    setError(null)
    try {
      const id = await createConversation()
      setConversations((list) => [
        { id, created_at: new Date().toISOString(), preview: null },
        ...list,
      ])
      setDraft('')
      setMessages([])
      setActiveId(id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleSend() {
    if (activeId === null) return
    const text = draft.trim()
    const isFirstMessage = messages.length === 0
    const baseLength = messages.length // to roll back the optimistic messages if the turn fails
    setError(null)
    setDraft('')
    setMessages((list) => [...list, { role: 'user', content: text }])
    setLoading(true)

    // The reply is shown as it is generated: the assistant bubble appears with the first piece of text.
    let started = false
    const onDelta = (piece: string) => {
      if (!started) {
        started = true
        setMessages((list) => [...list, { role: 'assistant', content: piece }])
      } else {
        setMessages((list) => {
          const last = list[list.length - 1]
          return [...list.slice(0, -1), { ...last, content: last.content + piece }]
        })
      }
    }

    try {
      const { reply, notification, summary, quiz } = await streamMessage(
        activeId,
        text,
        model || null,
        onDelta,
      )
      setMessages((list) => [
        // Normally the bubble already shows the reply; add it only if nothing was streamed.
        ...(started ? list : [...list, { role: 'assistant' as const, content: reply }]),
        ...(notification ? [{ role: 'system-notification' as const, content: notification }] : []),
        ...(summary ? [{ role: 'summary' as const, content: summary }] : []),
        ...(quiz ? [{ role: 'quiz' as const, content: quiz }] : []),
      ])
      // The first message becomes the conversation's preview in the sidebar.
      if (isFirstMessage) setConversations(await listConversations())
    } catch (err) {
      // The backend didn't save the turn (nothing is written if the stream breaks):
      // drop the optimistic messages and give the text back.
      setMessages((list) => list.slice(0, baseLength))
      setDraft(text)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleAddNote() {
    if (activeId === null) return
    const text = draft.trim()
    if (!text) return
    setError(null)
    setSavingNote(true)
    try {
      // Not optimistic: the backend can refuse (e.g. empty conversation), so wait for its answer.
      const note = await addNote(activeId, text)
      setMessages((list) => [...list, { role: 'note', content: note.content }])
      setDraft('')
    } catch (err) {
      // The draft is kept so nothing is lost.
      setError(errorMessage(err))
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={handleNew}
      />
      <main className="main">
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Fermer">
              ×
            </button>
          </div>
        )}
        {activeId === null ? (
          <div className="empty">
            <p>Aucune conversation ouverte.</p>
            <button className="new-button" onClick={handleNew}>
              + Nouvelle conversation
            </button>
          </div>
        ) : (
          <ChatWindow
            messages={messages}
            loading={loading}
            savingNote={savingNote}
            draft={draft}
            models={models}
            model={model}
            onModelChange={setModel}
            onDraftChange={setDraft}
            onSend={handleSend}
            onAddNote={handleAddNote}
          />
        )}
      </main>
    </div>
  )
}
