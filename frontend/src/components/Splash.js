import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAME } from './Brand';

export const SPLASH_MS = 5000;
const SEGMENTS = 18;

/* Shown at "/" only: holds for SPLASH_MS, then moves on to /home. */
export function useSplashRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const ms = process.env.NODE_ENV === 'test' ? 0 : SPLASH_MS;
    const timer = setTimeout(() => navigate('/home', { replace: true }), ms);
    return () => clearTimeout(timer);
  }, [navigate]);
}

/*
 * Colour blocks behind the campus photo, placed as in the poster. Units are % of the art box
 * (the building's ground line sits at 81.3%). [tone, left, top, width, height]
 */
const BLOCKS = [
  ['peach-soft', 3.9, 24.6, 18.8, 5.2],
  ['peach-soft', 13.3, 20.9, 16.4, 10.4],
  ['blue-soft', 23, 11.5, 13.7, 17.6],
  ['blue', 35, 6.4, 14.2, 21.2],
  ['blue', 43.4, 0, 14.3, 47.8],
  ['peach', 68, 12.7, 10.2, 21],
  ['blue-soft', 72.7, 22.4, 16, 24.6],
  ['peach-soft', 81.2, 44, 9.4, 9],
  // Reflection band below the ground line.
  ['blue-soft', 19.9, 82.8, 14.8, 13.4],
  ['blue', 35, 81.3, 6.8, 18.7],
  ['blue-soft', 48, 82.8, 12.5, 17.2],
  ['peach', 58, 81.3, 10.2, 14.9],
  ['blue', 68, 82, 8.6, 9.7],
  ['blue-soft', 76.6, 82.8, 10, 6],
];

// Hairlines: [axis, left, top, length]
const LINES = [
  ['v', 39, 0, 100],
  ['v', 56.5, 0, 16],
  ['v', 84, 14, 30],
  ['v', 6.2, 84, 16],
  ['v', 92, 70, 30],
  ['h', 2, 81.3, 96],
  ['h', 13, 12.6, 20],
  ['h', 80, 15.2, 19],
  ['h', 30, 98.5, 40],
];

const pct = (n) => `${n}%`;

export default function Splash() {
  useSplashRedirect();
  const campus = `${process.env.PUBLIC_URL}/campus.webp`;
  return (
    <div className="splash" style={{ '--splash-ms': `${SPLASH_MS}ms`, '--splash-segments': SEGMENTS }}>
      <p role="status" className="sr-only">
        Loading {APP_NAME}…
      </p>

      <header className="splash-head">
        <div>
          <p className="splash-nmit" aria-label="NMIT">
            NMIT
          </p>
          <p className="splash-sub">
            Nitte Meenakshi Institute
            <br />
            of Technology
          </p>
          <p className="splash-no">Nº 001</p>
          <span className="splash-rule" aria-hidden />
        </div>
        <div className="splash-meta">
          <p className="splash-year">2001</p>
          <ul className="splash-list splash-list-ruled">
            {['Engineering', 'Education', 'Innovation', 'Research', 'Community'].map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      </header>

      <div className="splash-stage">
        <div className="splash-art" aria-hidden>
          <span className="splash-sun" />
          {BLOCKS.map(([tone, left, top, width, height], i) => (
            <span key={i} className={`splash-block splash-${tone}`} style={{ left: pct(left), top: pct(top), width: pct(width), height: pct(height), '--dur': `${5 + (i % 4)}s`, '--delay': `${-i * 0.7}s`, '--dx': `${(i % 2 ? -1 : 1) * (4 + (i % 3) * 2)}px`, '--dy': `${(i % 3 === 0 ? -1 : 1) * (4 + (i % 4) * 2)}px`, '--rot': `${(i % 2 ? -1 : 1) * (0.3 + (i % 3) * 0.2)}deg` }} />
          ))}
          <img className="splash-reflection" src={campus} alt="" />
          <img className="splash-campus" src={campus} alt="" width="1600" height="641" decoding="async" fetchpriority="high" />
          {LINES.map(([axis, left, top, len], i) => (
            <span key={i} className={`splash-line splash-line-${axis}`} style={{ left: pct(left), top: pct(top), [axis === 'v' ? 'height' : 'width']: pct(len) }} />
          ))}
        </div>
      </div>

      <footer className="splash-foot">
        <ul className="splash-list">
          {['Learn', 'Build', 'Innovate', 'Grow'].map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <ul className="splash-list splash-list-end">
          {['Bangalore', 'Karnataka', 'India'].map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </footer>

      {/* Full-width bar of slanted segments that fill in over the splash; no outer frame. */}
      <div className="splash-loading" aria-hidden>
        <div className="splash-bar">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} style={{ '--i': i }} />
          ))}
        </div>
        <p className="splash-loading-label">Loading...</p>
      </div>
    </div>
  );
}
