import { useRef } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, description, breadcrumbs, actions, badge }) {
  return (
    <header className="page-header">
      <div className="titles">
        {breadcrumbs && (
          <nav aria-label="Breadcrumb" className="breadcrumb">
            {breadcrumbs.map((b, i) => (
              <span key={b.label} className="row" style={{ gap: 4 }}>
                {b.to ? <Link to={b.to}>{b.label}</Link> : <span aria-current="page">{b.label}</span>}
                {i < breadcrumbs.length - 1 && <span aria-hidden>/</span>}
              </span>
            ))}
          </nav>
        )}
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <h1 tabIndex={-1} data-page-title>
            {title}
          </h1>
          {badge}
        </div>
        {description && <p className="description">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, flush, className = '', bodyClassName = '', as: As = 'section', ...rest }) {
  return (
    <As className={`card ${flush ? 'card-flush' : ''} ${className}`} {...rest}>
      {(title || actions) && (
        <div className="card-header" style={flush ? { paddingBottom: 'var(--space-4)' } : undefined}>
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {flush ? children : <div className={`card-body ${bodyClassName}`}>{children}</div>}
    </As>
  );
}

/**
 * Figure tile in the poster's style: mono label, hairline rule and an automatic
 * index ("BALANCE ──── 01"), then the figure in the display face. `icon` and `tone`
 * are accepted for compatibility but intentionally not rendered as decoration.
 */
export function StatCard({ label, value, hint, to }) {
  const body = (
    <div className="card-body stat">
      <span className="stat-label">
        <span>{label}</span>
        <span className="stat-rule" aria-hidden />
        <span className="stat-index" aria-hidden />
      </span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
  return to ? (
    <Link to={to} className="card card-link stat-card">
      {body}
    </Link>
  ) : (
    <div className="card stat-card">{body}</div>
  );
}

/** Accessible tabs with roving focus (arrow keys). */
export function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next != null) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(tabs[next].value);
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.value}`}
          aria-selected={value === t.value}
          aria-controls={`panel-${t.value}`}
          tabIndex={value === t.value ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.icon && <t.icon size={16} aria-hidden />}
          {t.label}
          {t.count != null && <span className="badge no-dot">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ value, children }) {
  return (
    <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`}>
      {children}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DescriptionList({ items }) {
  return (
    <dl className="dl">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v ?? '–'}</dd>
        </div>
      ))}
    </dl>
  );
}
