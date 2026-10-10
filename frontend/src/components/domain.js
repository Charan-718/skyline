import { QRCodeSVG } from 'qrcode.react';
import { Flask } from '@phosphor-icons/react';
import { formatMoney } from '../utils/money';
import { dateParts } from '../utils/dates';

export function Money({ paise, compact, className = '' }) {
  return <span className={`num ${className}`}>{formatMoney(paise, { compact })}</span>;
}

export function SimulatedBanner({ children }) {
  return (
    <div className="simulated-banner" role="note">
      <Flask size={20} weight="fill" aria-hidden />
      <span>
        <strong>Simulated payment. No real money is charged.</strong> {children}
      </span>
    </div>
  );
}

/** QR rendering for opaque payloads (SOMS1:T:/SOMS1:M:). Always dark-on-white for scanner contrast. */
export function QrCode({ value, size = 220, label }) {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--color-qr-bg').trim() || '#ffffff';
  const fg = cs.getPropertyValue('--color-qr-fg').trim() || '#161412';
  return (
    <div className="qr-box">
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} bgColor={bg} fgColor={fg} role="img" aria-label={label || 'QR code'} />
    </div>
  );
}

export function DateTile({ iso }) {
  const { day, month } = dateParts(iso);
  return (
    <div className="date-tile" aria-hidden>
      <small>{month}</small>
      <b>{day}</b>
    </div>
  );
}

export function Avatar({ name }) {
  const initials = (name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="avatar" aria-hidden>
      {initials}
    </span>
  );
}
