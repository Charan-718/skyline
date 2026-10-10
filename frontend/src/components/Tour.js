import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from '@phosphor-icons/react';
import { APP_NAME } from './Brand';

/*
 * First-visit guided tour: dims the page, cuts a spotlight around one element at a time
 * (found by its `data-tour` attribute) and explains it in a card next to it.
 * Steps whose target is missing or hidden (e.g. desktop nav on a phone) are skipped.
 */

const STORAGE_KEY = 'campusflow.tour.v1';
const PAD = 8; // spotlight padding around the target
const GAP = 14; // space between spotlight and card
const MARGIN = 16; // keep the card this far from the viewport edge

export function hasSeenTour() {
  if (process.env.NODE_ENV === 'test') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    /* ignore */
  }
}

export function tourSteps(signedIn) {
  return [
    { title: `Welcome to ${APP_NAME}`, body: 'Everything for campus clubs in one place. Take a 30-second tour of where things live.' },
    { target: 'nav-events', title: 'Events', body: 'Browse what is coming up and book with a QR ticket. Members see their discounted price automatically.' },
    { target: 'nav-clubs', title: 'Clubs', body: 'Explore every club, join with a membership plan and shop their merch.' },
    { target: 'nav-announcements', title: 'Announcements', body: 'Schedule changes, deadlines and news from the clubs you follow.' },
    { target: 'menu', title: 'Menu', body: 'Events, clubs, announcements and your account are all in here.' },
    { target: 'browse-events', title: 'Start here', body: 'Jump straight into upcoming events and grab your first ticket.' },
    signedIn
      ? { target: 'account', title: 'Your account', body: 'Your profile, verification and sign-out live here. Tickets, orders and memberships are under My account.' }
      : { target: 'account', title: 'Sign in or join', body: 'Create an account to join clubs, book events and order merch from your phone.' },
    { target: 'theme', title: 'Light or dark', body: 'Switch the theme any time. That is it, enjoy!' },
  ];
}

function findTarget(name) {
  if (!name) return null;
  const el = [...document.querySelectorAll(`[data-tour="${name}"]`)].find((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
  });
  return el || null;
}

function placeCard(rect, card) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = card?.offsetWidth || 340;
  const h = card?.offsetHeight || 180;
  if (!rect) return { left: (vw - w) / 2, top: Math.max(MARGIN, (vh - h) / 2), side: 'center' };
  const below = rect.bottom + PAD + GAP;
  const above = rect.top - PAD - GAP - h;
  const side = below + h <= vh - MARGIN || above < MARGIN ? 'bottom' : 'top';
  const top = side === 'bottom' ? Math.min(below, vh - h - MARGIN) : above;
  const left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - w / 2), vw - w - MARGIN);
  return { left, top: Math.max(MARGIN, top), side };
}

export default function Tour({ steps, onClose }) {
  // Resolve once which steps can be shown on this screen size.
  const [visible] = useState(() => steps.filter((s) => !s.target || findTarget(s.target)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState({ left: 0, top: 0, side: 'center' });
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const step = visible[i];
  const last = i === visible.length - 1;

  const finish = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    const r = el ? el.getBoundingClientRect() : null;
    setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom } : null);
    setPos(placeCard(r, cardRef.current));
  }, [step]);

  // Bring the target into view, then measure (and keep measuring while the page moves).
  useLayoutEffect(() => {
    const el = findTarget(step?.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 220) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    measure();
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const settle = setTimeout(measure, 350); // after smooth scroll
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [step, measure]);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, visible.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish, visible.length]);

  if (!step) return null;

  return createPortal(
    <div className="tour" role="presentation">
      {/* Blocks clicks on the page while the tour is open. */}
      <div className="tour-backdrop" onClick={finish} />
      <div
        className={`tour-spot${rect ? '' : ' tour-spot-none'}`}
        style={rect ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : undefined}
        aria-hidden
      />
      <div ref={cardRef} className={`tour-card tour-card-${pos.side}`} style={{ left: pos.left, top: pos.top }} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
        <div className="tour-card-head">
          <span className="tour-count num">
            {i + 1} / {visible.length}
          </span>
          <button type="button" className="tour-close" onClick={finish} aria-label="Skip tour">
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p id="tour-body" className="tour-body">
          {step.body}
        </p>
        <div className="tour-dots" aria-hidden>
          {visible.map((s, n) => (
            <span key={s.title} className={n === i ? 'is-active' : n < i ? 'is-done' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          {i === 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={finish}>
              Skip
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
          )}
          <button ref={nextRef} type="button" className="btn btn-primary btn-sm" onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? 'Finish' : i === 0 ? 'Show me around' : 'Next'} {!last && <ArrowRight size={16} aria-hidden />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
