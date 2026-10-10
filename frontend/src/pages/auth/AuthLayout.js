import Brand from '../../components/Brand';
import { Link } from 'react-router-dom';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="auth-layout">
      <div className="auth-card stack-lg">
        <Brand style={{ border: 0, padding: 0, height: 'auto' }} />
        <div className="stack" style={{ borderTop: '1px solid var(--color-border-strong)', paddingTop: 'var(--space-6)' }}>
          <div>
            <h1 tabIndex={-1} data-page-title>
              {title}
            </h1>
            {subtitle && (
              <p className="serif muted" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-lg)', lineHeight: 1.3 }}>
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </div>
        {footer && <p className="muted">{footer}</p>}
        <nav aria-label="Legal" className="row subtle" style={{ gap: 'var(--space-5)' }}>
          <Link to="/terms">Terms of use</Link>
          <Link to="/privacy">Privacy policy</Link>
        </nav>
      </div>
    </main>
  );
}
