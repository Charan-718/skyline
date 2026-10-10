import { Link } from 'react-router-dom';

export const APP_NAME = 'Campus Flow';

// Mirrors public/logo.svg: five circuit strokes, each starting near the center and ending in a node ring at the corner. [colour, path, ring x, ring y]
const ARMS = [
  ['#3E63D6', 'M20.1 5.2L32.4 -6.9Q39.4 -13.8 36.3 -23.1L6.7 -111.8Q0.0 -131.7 -7.9 -112.3L-21.7 -78.5', -25.7, -68.7],
  ['#10A9EE', 'M1.2 20.7L16.6 28.7Q25.3 33.2 33.1 27.4L108.4 -28.2Q125.3 -40.7 104.3 -42.2L68.0 -44.9', 57.4, -45.6],
  ['#F4663C', 'M-19.3 7.6L-22.1 24.6Q-23.7 34.3 -15.8 40.0L60.3 94.3Q77.4 106.6 72.4 86.2L63.7 50.8', 61.2, 40.5],
  ['#CB3A9C', 'M-13.2 -16.0L-30.2 -13.5Q-39.9 -12.0 -42.9 -2.7L-71.1 86.5Q-77.4 106.6 -59.6 95.5L-28.6 76.3', -19.6, 70.7],
  ['#7643C6', 'M11.2 -17.5L3.5 -32.9Q-0.9 -41.7 -10.7 -41.6L-104.3 -40.9Q-125.3 -40.7 -109.2 -27.1L-81.4 -3.6', -73.3, 3.2],
];

/** The star mark on its own. Decorative by default; pass a title when it stands alone. */
export function Logo({ size = 32, title, className }) {
  return (
    <svg
      viewBox="-120.8 -132.3 241.4 241.4"
      width={size}
      height={size}
      className={className}
      fill="none"
      strokeWidth="7.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {ARMS.map(([color, d, cx, cy], i) => (
        <g key={color} stroke={color} className={`logo-arm logo-arm-${i}`} style={{ '--arm-index': i }}>
          <path d={d} className="logo-arm-path" pathLength="100" />
          <circle cx={cx} cy={cy} r="10.0" className="logo-arm-circle" />
        </g>
      ))}
    </svg>
  );
}

/** Mark plus wordmark, linking home. */
export default function Brand({ className = 'brand', style }) {
  return (
    <Link to="/" className={className} style={style} aria-label={`${APP_NAME} home`}>
      <Logo size={34} className="brand-mark" />
      <span className="brand-word">{APP_NAME}</span>
    </Link>
  );
}
