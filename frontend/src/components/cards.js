import { Link } from 'react-router-dom';
import { MapPin, UsersThree } from '@phosphor-icons/react';
import { Badge, StatusBadge } from './feedback';
import { DateTile, Money } from './domain';
import { formatDateTime, formatRelative } from '../utils/dates';
import { label } from '../utils/status';

export function EventCard({ event }) {
  const membersOnly = event.nonMemberPricePaise == null;
  const fromPrice = membersOnly ? event.memberPricePaise : Math.min(event.memberPricePaise, event.nonMemberPricePaise ?? Infinity);
  return (
    <Link to={`/events/${event.id}`} className="card card-link" aria-label={`${event.title}, ${formatDateTime(event.startsAt)}`}>
      <div className="card-body stack-sm">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'nowrap' }}>
          <DateTile iso={event.startsAt} />
          <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
            <span className="subtle">{event.clubName}</span>
            <h3 className="wrap-anywhere">{event.title}</h3>
          </div>
        </div>
        <div className="subtle row" style={{ gap: 6 }}>
          <MapPin size={14} aria-hidden style={{ flex: 'none' }} />
          <span className="wrap-anywhere" style={{ flex: 1 }}>{`${event.venue} · ${formatDateTime(event.startsAt)}`}</span>
        </div>
        <div className="row-between">
          <div className="row">
            <StatusBadge status={event.salesStatus} />
            {membersOnly && <Badge tone="accent">Members only</Badge>}
            {event.earlyBirdRemaining > 0 && event.salesStatus === 'OPEN' && <Badge tone="accent">Early-bird</Badge>}
          </div>
          <span className="cell-title">{fromPrice === 0 ? 'Free' : <>from <Money paise={fromPrice} /></>}</span>
        </div>
        {event.salesStatus === 'OPEN' && (
          <div className="subtle row" style={{ gap: 6 }}>
            <UsersThree size={14} aria-hidden />
            <span className="num">{`${event.remainingSeats} of ${event.capacity} seats left`}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function AnnouncementItem({ a, showClub = true, actions }) {
  return (
    <article className="stack-sm">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone={a.category === 'SCHEDULE_CHANGE' ? 'warning' : a.category === 'DEADLINE' ? 'danger' : 'primary'} dot={false}>
              {label('category', a.category)}
            </Badge>
            {a.audience === 'MEMBERS' && <Badge dot={false}>Members only</Badge>}
            {a.status === 'DRAFT' && <StatusBadge status="DRAFT" />}
          </div>
          <h3 className="wrap-anywhere announcement-title">{a.title}</h3>
        </div>
        {actions}
      </div>
      <p className="prewrap muted" style={{ fontSize: 'var(--font-size-md)' }}>
        {a.body}
      </p>
      <p className="subtle">
        {showClub && <>{a.clubName} · </>}
        {a.status === 'PUBLISHED' ? (
          <>
            Published {formatRelative(a.publishedAt)} by {a.publishedByName}
          </>
        ) : (
          <>Draft by {a.createdByName}</>
        )}
        {a.eventTitle && (
          <>
            {' '}
            · About <Link to={`/events/${a.eventId}`}>{a.eventTitle}</Link>
          </>
        )}
      </p>
    </article>
  );
}
