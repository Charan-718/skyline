import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChatCircleDots, PaperPlaneRight, Sparkle, X } from '@phosphor-icons/react';
import { eventsApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';

// Floating per-event assistant (bottom-right of the event page).
//   - Suggested questions come from the server and are answered from the event's own data.
//   - Free-text questions (signed-in users) go to the backend, which asks Gemini and only answers
//     about this event. Answers are rendered as plain text, never HTML.
// The conversation is kept in sessionStorage per user and event, so a refresh keeps it and another
// user in the same tab never sees it.

const MAX_HISTORY = 6;

const storageKey = (userId, eventId) => `soms.assistant.${userId || 'anon'}.${eventId}`;

function loadMessages(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(key, messages) {
  try {
    sessionStorage.setItem(key, JSON.stringify(messages.slice(-30)));
  } catch {
    /* storage full or blocked: the chat still works for this page view */
  }
}

export function EventAssistant({ eventId, eventTitle }) {
  const { user } = useAuth();
  const location = useLocation();
  const key = storageKey(user?.id, eventId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(() => loadMessages(key));
  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => setMessages(loadMessages(key)), [key]);
  useEffect(() => saveMessages(key, messages), [key, messages]);
  useEffect(() => {
    if (open) (inputRef.current || listRef.current)?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const config = useQuery({
    queryKey: ['event-assistant', eventId, user?.id ?? null],
    queryFn: () => eventsApi.assistant(eventId),
    enabled: open,
    staleTime: 60_000,
  });

  const ask = useMutation({
    mutationFn: (body) => eventsApi.askAssistant(eventId, body),
    onSuccess: (r) => setMessages((m) => [...m, { role: 'assistant', text: r.answer, inScope: r.inScope }]),
    onError: (e) => setMessages((m) => [...m, { role: 'error', text: e.message || 'Something went wrong. Please try again.' }]),
  });

  const history = () =>
    messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.inScope !== false))
      .slice(-MAX_HISTORY)
      .map(({ role, text }) => ({ role, text: text.slice(0, 1500) }));

  const sendIntent = (s) => {
    if (ask.isPending) return;
    setMessages((m) => [...m, { role: 'user', text: s.label }]);
    ask.mutate({ intent: s.intent });
  };

  const sendText = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || ask.isPending) return;
    const prior = history();
    setMessages((m) => [...m, { role: 'user', text }]);
    setDraft('');
    ask.mutate({ message: text, history: prior });
  };

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  const free = config.data?.freeText;
  const canType = free?.available && free?.signedIn;

  return (
    <>
      {!open && (
        <button ref={launcherRef} type="button" className="assistant-launcher" aria-haspopup="dialog" aria-expanded={false} onClick={() => setOpen(true)}>
          <ChatCircleDots size={22} weight="fill" aria-hidden />
          <span>Ask about this event</span>
        </button>
      )}
      {open && (
        <section
          className="assistant-panel"
          role="dialog"
          aria-label={`Assistant for ${eventTitle}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          <header className="assistant-head">
            <div className="assistant-title">
              <Sparkle size={18} weight="fill" aria-hidden />
              <div>
                <strong>Event assistant</strong>
                <span className="assistant-sub">{eventTitle}</span>
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label="Close assistant" onClick={close}>
              <X size={18} aria-hidden />
            </button>
          </header>

          <div className="assistant-messages" ref={listRef} tabIndex={-1} aria-live="polite">
            {messages.length === 0 && (
              <p className="assistant-empty">
                Hi! Ask me anything about <strong>{eventTitle}</strong>: timings, venue, tickets, prices or seats.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg assistant-msg-${m.role}`}>
                {m.text}
              </div>
            ))}
            {ask.isPending && (
              <div className="assistant-msg assistant-msg-assistant assistant-typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          {config.data?.suggestions?.length > 0 && (
            <div className="assistant-chips" role="group" aria-label="Suggested questions">
              {config.data.suggestions.map((s) => (
                <button key={s.intent} type="button" className="assistant-chip" disabled={ask.isPending} onClick={() => sendIntent(s)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {config.isError && <p className="assistant-note">The assistant could not load. Please try again later.</p>}

          {free && !free.available && <p className="assistant-note">Pick a suggested question above. Typed questions are not available right now.</p>}
          {free?.available && !free.signedIn && (
            <p className="assistant-note">
              <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to ask your own question.
            </p>
          )}
          {canType && (
            <form className="assistant-input" onSubmit={sendText}>
              <input
                ref={inputRef}
                className="input"
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about this event…"
                aria-label="Your question"
              />
              <button type="submit" className="btn btn-primary" disabled={!draft.trim() || ask.isPending} aria-label="Send">
                <PaperPlaneRight size={18} aria-hidden />
              </button>
            </form>
          )}
          <p className="assistant-disclaimer">AI answers can be wrong. The event page is the source of truth.</p>
        </section>
      )}
    </>
  );
}
