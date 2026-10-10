import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraSlash, CheckCircle, IdentificationBadge, Keyboard, LockKey, Prohibit, Ticket, WarningCircle, XCircle } from '@phosphor-icons/react';
import { eventsApi, membershipsApi } from '../../api/endpoints';
import { newIdempotencyKey } from '../../api/client';
import { Card, PageHeader, Tabs } from '../../components/layout';
import { Alert, EmptyState, ErrorState, LoadingState, ProgressBar, QueryState, StatusBadge } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/forms';
import { DataTable } from '../../components/DataTable';
import { formatDate, formatTime } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessages';
import { label } from '../../utils/status';

const READER_ID = 'qr-reader';
const DEDUPE_MS = 3000;

/** Camera scanner using html5-qrcode (rear camera). Falls back to manual entry if unavailable. */
function CameraScanner({ onDecode, active }) {
  const [state, setState] = useState('idle'); // idle | starting | running | error
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {
        /* already stopped */
      }
    }
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    setState('starting');
    setError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const s = new Html5Qrcode(READER_ID, { verbose: false });
      scannerRef.current = s;
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) }, (text) => onDecode(text), () => {});
      setState('running');
    } catch (e) {
      scannerRef.current = null;
      setState('error');
      setError(String(e?.message || e).includes('Permission') ? 'Camera permission was denied. Allow camera access in your browser settings, or enter codes manually.' : 'No camera is available on this device (camera needs HTTPS or localhost). Enter ticket codes manually instead.');
    }
  }, [onDecode]);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);
  useEffect(() => () => {
    stop();
  }, [stop]);

  return (
    <div className="stack-sm">
      <div className="scanner-frame">
        <div id={READER_ID} style={{ width: '100%' }} />
        {state !== 'running' && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--color-camera-text)', textAlign: 'center', padding: 'var(--space-4)' }}>
            <div className="stack-sm" style={{ alignItems: 'center' }}>
              {state === 'error' ? <CameraSlash size={40} aria-hidden /> : <Camera size={40} aria-hidden />}
              <span>{state === 'starting' ? 'Starting camera…' : state === 'error' ? 'Camera unavailable' : 'Camera is off'}</span>
            </div>
          </div>
        )}
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {state === 'running' ? (
        <Button icon={CameraSlash} onClick={stop} block>
          Stop camera
        </Button>
      ) : (
        <Button variant="primary" icon={Camera} onClick={start} loading={state === 'starting'} block>
          Start camera
        </Button>
      )}
    </div>
  );
}

const TICKET_RESULTS = {
  CHECKED_IN: { tone: 'success', icon: CheckCircle, title: 'CHECKED IN' },
  TICKET_ALREADY_USED: { tone: 'warning', icon: WarningCircle, title: 'ALREADY USED' },
  TICKET_WRONG_EVENT: { tone: 'danger', icon: XCircle, title: 'WRONG EVENT' },
  TICKET_CANCELLED: { tone: 'danger', icon: Prohibit, title: 'CANCELLED' },
  TICKET_NOT_FOUND: { tone: 'danger', icon: XCircle, title: 'INVALID TICKET' },
  INVALID_QR_FORMAT: { tone: 'danger', icon: XCircle, title: 'INVALID CODE' },
};

function ResultPanel({ result }) {
  if (!result) {
    return (
      <div className="scan-result" style={{ '--b-fg': 'var(--color-text-muted)', '--b-bg': 'var(--color-surface-muted)', borderStyle: 'dashed' }}>
        <Ticket size={48} aria-hidden />
        <p>Scan a ticket or type its code to check someone in.</p>
      </div>
    );
  }
  const r = TICKET_RESULTS[result.code] || { tone: 'danger', icon: XCircle, title: 'NOT ACCEPTED' };
  const Icon = r.icon;
  return (
    <div className="scan-result" key={result.at} style={{ '--b-fg': `var(--color-${r.tone})`, '--b-bg': `var(--color-${r.tone}-soft)` }} role="alert" aria-live="assertive">
      <Icon size={64} weight="fill" aria-hidden />
      <h2>{r.title}</h2>
      {result.data?.holderName && <p style={{ fontWeight: 700 }}>{result.data.holderName}</p>}
      {result.code === 'CHECKED_IN' ? (
        <p className="muted">
          {label('buyerType', result.data.buyerType)} · <span className="mono">{result.data.ticketCode}</span> · {formatTime(result.data.checkedInAt)}
        </p>
      ) : (
        <p className="muted">{result.message}</p>
      )}
    </div>
  );
}

function TicketScanner({ eventId, active }) {
  const qc = useQueryClient();
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null);
  const last = useRef({ payload: null, at: 0 });
  const stats = useQuery({ queryKey: ['check-ins', eventId], queryFn: () => eventsApi.checkIns(eventId), refetchInterval: active ? 15000 : false });

  const checkIn = useMutation({
    mutationFn: (payload) => eventsApi.checkIn(eventId, payload, newIdempotencyKey()),
    onSuccess: (data) => {
      setResult({ code: 'CHECKED_IN', data, at: Date.now() });
      qc.invalidateQueries({ queryKey: ['check-ins', eventId] });
      navigator.vibrate?.(80);
    },
    onError: (e) => {
      setResult({ code: e.code, message: errorMessage(e), data: e.details, at: Date.now() });
      navigator.vibrate?.([60, 60, 60]);
    },
  });

  const submit = useCallback(
    (payload) => {
      const p = payload.trim();
      if (!p) return;
      const now = Date.now();
      if (last.current.payload === p && now - last.current.at < DEDUPE_MS) return; // debounce repeated frames
      last.current = { payload: p, at: now };
      checkIn.mutate(p);
    },
    [checkIn],
  );

  return (
    <div className="grid grid-2">
      <div className="stack">
        <CameraScanner onDecode={submit} active={active} />
        <Card title="Enter code manually">
          <form
            className="row"
            style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              last.current = { payload: null, at: 0 };
              submit(manual);
              setManual('');
            }}
          >
            <Field label="Ticket code" hint="10 characters, printed under the QR." className="grow" >
              <Input className="input mono" autoComplete="off" autoCapitalize="characters" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} />
            </Field>
            <Button type="submit" variant="primary" icon={Keyboard} loading={checkIn.isPending} style={{ marginBottom: 22 }}>
              Check in
            </Button>
          </form>
        </Card>
      </div>
      <div className="stack">
        <ResultPanel result={result} />
        <Card title="Door count">
          <QueryState query={stats}>
            {(s) => (
              <div className="stack">
                <ProgressBar value={s.checkedIn} max={s.ticketsSold || 1} label={`${s.checkedIn} of ${s.ticketsSold} ticket holders checked in`} />
                <DataTable
                  caption="Recent check-ins"
                  rows={s.recent.slice(0, 8)}
                  empty={<p className="subtle">No check-ins yet.</p>}
                  columns={[
                    { key: 'checkedInAt', header: 'Time', render: (c) => formatTime(c.checkedInAt) },
                    { key: 'holderName', header: 'Attendee' },
                    { key: 'checkedInByName', header: 'Scanned by', hideOnMobile: true },
                  ]}
                />
              </div>
            )}
          </QueryState>
        </Card>
      </div>
    </div>
  );
}

function MembershipVerifier({ active }) {
  const [manual, setManual] = useState('');
  const verify = useMutation({ mutationFn: (payload) => membershipsApi.verifyQr(payload.trim()) });
  const r = verify.data;
  const tone = r ? (r.effectiveStatus === 'ACTIVE' ? 'success' : 'warning') : null;
  return (
    <div className="grid grid-2">
      <div className="stack">
        <CameraScanner onDecode={(t) => !verify.isPending && verify.mutate(t)} active={active} />
        <Card title="Paste card payload">
          <form
            className="row"
            style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) verify.mutate(manual);
            }}
          >
            <Field label="Membership QR payload" className="grow">
              <Input className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="SOMS1:M:…" />
            </Field>
            <Button type="submit" variant="primary" loading={verify.isPending} style={{ marginBottom: 0 }}>
              Verify
            </Button>
          </form>
        </Card>
      </div>
      <div>
        {verify.isError ? (
          <div className="scan-result" style={{ '--b-fg': 'var(--color-danger)', '--b-bg': 'var(--color-danger-soft)' }} role="alert">
            <XCircle size={64} weight="fill" aria-hidden />
            <h2>NOT VERIFIED</h2>
            <p className="muted">{errorMessage(verify.error)}</p>
          </div>
        ) : r ? (
          <div className="scan-result" style={{ '--b-fg': `var(--color-${tone})`, '--b-bg': `var(--color-${tone}-soft)` }} role="alert">
            <IdentificationBadge size={64} weight="fill" aria-hidden />
            <h2>{r.effectiveStatus === 'ACTIVE' ? 'ACTIVE MEMBER' : r.effectiveStatus}</h2>
            <p style={{ fontWeight: 700 }}>{r.memberName}</p>
            <p className="muted">
              {r.clubName} · {r.planName} · <span className="mono">{r.memberNumber}</span>
            </p>
            <p className="muted">{r.effectiveStatus === 'ACTIVE' ? 'Valid until' : 'Expired on'} {formatDate(r.expiresOn)}</p>
          </div>
        ) : (
          <div className="scan-result" style={{ '--b-fg': 'var(--color-text-muted)', '--b-bg': 'var(--color-surface-muted)', borderStyle: 'dashed' }}>
            <IdentificationBadge size={48} aria-hidden />
            <p>Scan a digital membership card. Verifying never changes the card or uses a ticket.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Scan() {
  const { eventId } = useParams();
  const [tab, setTab] = useState('tickets');
  const event = useQuery({ queryKey: ['event', eventId], queryFn: () => eventsApi.get(eventId) });
  if (event.isPending) return <LoadingState rows={8} />;
  if (event.isError) return <div className="card"><ErrorState error={event.error} onRetry={() => event.refetch()} /></div>;
  const e = event.data;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Event duties', to: '/me/duties' }, { label: e.title, to: `/events/${e.id}` }, { label: 'Scanner' }]} title="Door check-in" description={e.title} badge={<StatusBadge status={e.status} />} />
      {!e.viewerCanScan && (
        <div className="card">
          <EmptyState icon={LockKey} title="You're not on the door team for this event" action={<Button to={`/events/${e.id}`}>View event</Button>}>
            Ask the club head or an organizer to add you as event staff. Only assigned volunteers, organizers and the club head can check people in.
          </EmptyState>
        </div>
      )}
      {e.status !== 'PUBLISHED' && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert tone="warning">Check-in is only open while the event is published.</Alert>
        </div>
      )}
      {e.viewerCanScan && (
        <>
          <Tabs label="Scanner mode" value={tab} onChange={setTab} tabs={[{ value: 'tickets', label: 'Check in tickets', icon: Ticket }, { value: 'membership', label: 'Verify membership card', icon: IdentificationBadge }]} />
          {tab === 'tickets' ? <TicketScanner eventId={eventId} active={tab === 'tickets'} /> : <MembershipVerifier active={tab === 'membership'} />}
        </>
      )}
    </>
  );
}
