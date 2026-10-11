import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowClockwise, ArrowRight, Check, MagicWand, PaperPlaneRight, Warning } from '@phosphor-icons/react';
import { eventsApi } from '../../api/endpoints';
import { Button } from '../../components/Button';
import { Badge } from '../../components/feedback';
import { formatDateTime } from '../../utils/dates';
import { formatMoney } from '../../utils/money';

// Event Draft Agent UI (create and edit). The server does all extraction, date handling and
// validation; this file keeps the conversation, shows questions with one-click answers, and hands a
// READY draft (create) or patch (edit) back to the page, which saves through the normal endpoints.

export function useAgentAvailable() {
  const q = useQuery({ queryKey: ['event-agent-status'], queryFn: () => eventsApi.agentStatus(), staleTime: 5 * 60_000, retry: false });
  return Boolean(q.data?.available);
}

/** What the agent said, flattened to text so the model sees its own previous questions next turn. */
const historyText = (r) => [r.message, ...(r.questions || []).map((q) => `- ${q.text}`)].join('\n');

/**
 * turnFn(body) -> response. mode 'create' keeps a `draft`; mode 'edit' keeps a `patch`.
 * send(text): a user turn (calls Gemini). apply(patch, labels): one-click answer, re-checked without Gemini.
 */
export function useAgentConversation(turnFn, mode) {
  const valueKey = mode === 'create' ? 'draft' : 'patch';
  const [state, setState] = useState({ messages: [], value: {}, sources: {}, partials: {}, last: null, pending: false, error: null });

  const run = async (messages, value, sources, partials) => {
    setState((s) => ({ ...s, messages, pending: true, error: null }));
    try {
      const r = await turnFn({ messages, [valueKey]: value, sources, partials });
      setState({
        messages: [...messages, { role: 'assistant', text: historyText(r) }],
        value: r[valueKey] ?? value,
        sources: r.sources ?? sources,
        partials: r.partials ?? {},
        last: r,
        pending: false,
        error: null,
      });
    } catch (e) {
      setState((s) => ({ ...s, pending: false, error: e }));
    }
  };

  return {
    ...state,
    send: (text) => run([...state.messages, { role: 'user', text: text.slice(0, 2000) }].slice(-20), state.value, state.sources, state.partials),
    apply: (patch) => {
      const sources = { ...state.sources };
      Object.keys(patch).forEach((k) => (sources[k] = 'suggested'));
      // Suggestions only exist after a turn, so the history ends with the agent's reply: no Gemini call.
      return run(state.messages, { ...state.value, ...patch }, sources, state.partials);
    },
    /** After a failure the last message is still the user's: send it again without retyping. */
    retry: () => {
      if (state.messages.at(-1)?.role === 'user') run(state.messages, state.value, state.sources, state.partials);
    },
    reset: () => setState({ messages: [], value: {}, sources: {}, partials: {}, last: null, pending: false, error: null }),
  };
}

function Question({ q, disabled, onOption, onApply }) {
  return (
    <li className="agent-question">
      <span>{q.text}</span>
      {(q.options?.length > 0 || q.suggestion || q.suggestions?.length > 0) && (
        <div className="agent-question-actions">
          {(q.options || []).map((o) => (
            <button key={o} type="button" className="assistant-chip" disabled={disabled} onClick={() => onOption(o)}>
              {o}
            </button>
          ))}
          {q.suggestion && (
            <button type="button" className="assistant-chip agent-chip-suggest" disabled={disabled} onClick={() => onApply(q.suggestion.patch)} title={q.suggestion.description}>
              <Check size={14} aria-hidden /> {q.suggestion.label}
            </button>
          )}
          {(q.suggestions || []).map((s) => (
            <button key={s.label} type="button" className="assistant-chip agent-chip-suggest" disabled={disabled} onClick={() => onApply(s.patch)}>
              <Check size={14} aria-hidden /> {s.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** The conversation: messages, the latest questions with answers, the "how I read it" lines, input. */
export function AgentChat({ convo, examples = [], placeholder, footer }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [convo.messages.length, convo.pending]);
  const last = convo.last;
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() || convo.pending) return;
    convo.send(text.trim());
    setText('');
  };

  return (
    <div className="agent-chat">
      <div className="agent-messages" ref={listRef} aria-live="polite">
        {convo.messages.length === 0 && (
          <div className="agent-empty">
            <MagicWand size={22} aria-hidden />
            <p>Describe the event in your own words. I'll fill in what you tell me and ask about anything missing — I never guess dates, venues, seats or prices.</p>
            {examples.length > 0 && (
              <div className="agent-question-actions">
                {examples.map((x) => (
                  <button key={x} type="button" className="assistant-chip" onClick={() => convo.send(x)}>
                    {x}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {convo.messages.map((m, i) => {
          const isLast = i === convo.messages.length - 1 && m.role === 'assistant';
          if (m.role === 'user') return <div key={i} className="assistant-msg assistant-msg-user">{m.text}</div>;
          if (!isLast || !last) return <div key={i} className="assistant-msg assistant-msg-assistant">{m.text}</div>;
          return (
            <div key={i} className="assistant-msg assistant-msg-assistant agent-reply">
              <span>{last.message}</span>
              {last.interpretation?.length > 0 && (
                <ul className="agent-read">
                  {last.interpretation.map((x, j) => (
                    <li key={j}>
                      {x.phrase ? <>“{x.phrase}” <ArrowRight size={12} aria-hidden /> </> : null}
                      {x.resolved}
                    </li>
                  ))}
                </ul>
              )}
              {last.questions?.length > 0 && (
                <ol className="agent-questions">
                  {last.questions.map((q) => (
                    <Question key={q.id} q={q} disabled={convo.pending} onOption={(o) => convo.send(o)} onApply={(patch) => convo.apply(patch)} />
                  ))}
                </ol>
              )}
              {last.warnings?.length > 0 && (
                <ul className="agent-warnings">
                  {last.warnings.map((w) => (
                    <li key={w}>
                      <Warning size={14} aria-hidden /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {convo.pending && <div className="assistant-msg assistant-msg-assistant agent-thinking">Thinking…</div>}
        {convo.error && (
          <div className="assistant-msg assistant-msg-error agent-error">
            <span>
              {convo.error.code === 'AGENT_UNAVAILABLE' ? 'The AI service is slow or busy right now. Your message is kept — try again, or continue manually.' : convo.error.message || 'Something went wrong.'}
            </span>
            {convo.messages.at(-1)?.role === 'user' && (
              <Button size="sm" icon={ArrowClockwise} onClick={() => convo.retry()}>
                Try again
              </Button>
            )}
          </div>
        )}
      </div>
      <form className="agent-input" onSubmit={submit}>
        <textarea
          className="textarea"
          rows={2}
          value={text}
          maxLength={2000}
          placeholder={placeholder}
          aria-label="Message to the event agent"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
        />
        <Button variant="primary" type="submit" icon={PaperPlaneRight} disabled={!text.trim()} loading={convo.pending}>
          Send
        </Button>
      </form>
      {footer}
    </div>
  );
}

const SOURCE_BADGE = {
  user: ['From you', 'success'],
  generated: ['Suggested by AI', 'accent'],
  suggested: ['Suggested', 'info'],
  default: ['Default', 'neutral'],
};

const ROWS = [
  ['title', 'Title'],
  ['venue', 'Venue'],
  ['startsAt', 'Starts'],
  ['endsAt', 'Ends'],
  ['registrationOpensAt', 'Registration opens'],
  ['registrationClosesAt', 'Registration closes'],
  ['capacity', 'Capacity'],
  ['memberPricePaise', 'Member price'],
  ['nonMemberPricePaise', 'Non-member price'],
  ['earlyBirdMemberPricePaise', 'Early-bird member price'],
  ['earlyBirdNonMemberPricePaise', 'Early-bird non-member price'],
  ['earlyBirdEndsAt', 'Early bird ends'],
  ['earlyBirdQuantity', 'Early-bird tickets'],
  ['earlyAccessOpensAt', 'Member early access'],
  ['description', 'Description'],
];
const REQUIRED = ['title', 'venue', 'startsAt', 'endsAt', 'registrationOpensAt', 'registrationClosesAt', 'capacity', 'memberPricePaise', 'nonMemberPricePaise'];

function show(key, v) {
  if (key === 'nonMemberPricePaise' && v === null) return 'Members only';
  if (v === undefined || v === null || v === '') return null;
  if (/At$/.test(key)) return formatDateTime(v);
  if (/PricePaise$/.test(key)) return v === 0 ? 'Free' : formatMoney(v);
  return String(v);
}

/** "Draft so far": every field with where its value came from; required gaps marked. */
export function DraftSummary({ draft, sources }) {
  return (
    <dl className="agent-draft">
      {ROWS.map(([key, label]) => {
        const value = show(key, draft[key]);
        if (value == null && !REQUIRED.includes(key)) return null;
        const [badge, tone] = SOURCE_BADGE[sources[key]] || [];
        return (
          <div key={key} className="agent-draft-row">
            <dt>{label}</dt>
            <dd>
              {value == null ? <Badge tone="warning">Needed</Badge> : <span className={key === 'description' ? 'prewrap' : undefined}>{value}</span>}
              {value != null && badge && <Badge tone={tone} dot={false}>{badge}</Badge>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
