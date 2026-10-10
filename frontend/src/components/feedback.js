import { ArrowClockwise, CheckCircle, Info, Tray, Warning, WarningCircle } from '@phosphor-icons/react';
import { statusOf } from '../utils/status';
import { errorMessage } from '../utils/errorMessages';
import { Button } from './Button';
import { Logo } from './Brand';

export function Badge({ tone = 'neutral', dot = true, children, className = '' }) {
  return <span className={`badge tone-${tone} ${dot ? '' : 'no-dot'} ${className}`}>{children}</span>;
}

export function StatusBadge({ status, label }) {
  const s = statusOf(status);
  return <Badge tone={s.tone}>{label || s.label}</Badge>;
}

const ALERT_ICON = { info: Info, success: CheckCircle, warning: Warning, danger: WarningCircle };

export function Alert({ tone = 'info', title, children, action }) {
  const Icon = ALERT_ICON[tone] || Info;
  return (
    <div className={`alert tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={20} weight="fill" aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}

export const Spinner = ({ label = 'Loading' }) => <span className="spinner" role="status" aria-label={label} />;

export function Skeleton({ height = 16, width = '100%', style }) {
  return <span className="skeleton" style={{ height, width, ...style }} aria-hidden />;
}

/**
 * The Campus Flow star as an animated loader revealing its 5 corner lines from center.
 */
export function LogoLoader({ size = 64, label = 'Loading…', page = false }) {
  return (
    <div className={`logo-loader${page ? ' logo-loader-page' : ''}`} role="status" aria-live="polite">
      <Logo size={size} className="logo-loader-mark" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Whole-page loading: route code, auth checks and pages waiting on their main record. */
export const PageLoader = ({ size = 112, label }) => <LogoLoader size={size} label={label} page />;

/** Loading inside a section of a page. */
export function LoadingState({ size = 64, label }) {
  return <LogoLoader size={size} label={label} />;
}

export function CardsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card card-body stack-sm" key={i}>
          <Skeleton width="50%" />
          <Skeleton height={28} width="70%" />
          <Skeleton width="40%" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Tray, title, children, action }) {
  return (
    <div className="state">
      <div className="state-icon">
        <Icon size={24} aria-hidden />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  return (
    <div className="state error" role="alert">
      <div className="state-icon">
        <WarningCircle size={24} aria-hidden />
      </div>
      <h3>{title}</h3>
      <p>{errorMessage(error)}</p>
      {error?.requestId && <p className="subtle mono">Reference: {error.requestId}</p>}
      {onRetry && (
        <div className="actions">
          <Button icon={ArrowClockwise} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renders loading / error / empty / data for a TanStack query. */
export function QueryState({ query, isEmpty, empty, loading, children }) {
  if (query.isPending) return loading || <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const emptyNow = isEmpty ? isEmpty(data) : Array.isArray(data) ? data.length === 0 : Array.isArray(data?.data) ? data.data.length === 0 : !data;
  if (emptyNow && empty) return empty;
  return children(data);
}

export function ProgressBar({ value, max = 100, tone, label, showValue = true }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = tone ? `var(--color-${tone})` : undefined;
  return (
    <div className="stack-sm" style={{ gap: 4 }}>
      {(label || showValue) && (
        <div className="row-between subtle">
          <span>{label}</span>
          {showValue && <span className="num">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label || 'Progress'}>
        <span style={{ width: `${pct}%`, '--p-color': color }} />
      </div>
    </div>
  );
}
