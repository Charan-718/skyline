import { useEffect, useState } from 'react';
import { APP_NAME, Logo } from './Brand';

export const SPLASH_MS = 5000;

// Shown once per page load: remounting App (tests, hot reload) doesn't replay it.
let shown = process.env.NODE_ENV === 'test';

export function useSplash() {
  const [visible, setVisible] = useState(!shown);
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      shown = true;
      setVisible(false);
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  return visible;
}

export default function Splash() {
  return (
    <div className="splash" role="status" aria-label={`Loading ${APP_NAME}`} style={{ '--splash-ms': `${SPLASH_MS}ms` }}>
      <div className="splash-brand">
        <Logo size={72} />
        <span className="splash-word">{APP_NAME}</span>
        <span className="splash-tag">Clubs, events and money, in one place</span>
        <span className="splash-progress" aria-hidden />
      </div>
      <img className="splash-campus" src={`${process.env.PUBLIC_URL}/campus.webp`} alt="" width="1600" height="641" decoding="async" fetchpriority="high" />
    </div>
  );
}
