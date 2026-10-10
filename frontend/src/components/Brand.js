import { Link } from 'react-router-dom';

export const APP_NAME = 'Campus Flow';

// Mirrors public/logo.svg: five circuit strokes, each ending in a node ring. [colour, path, ring x, ring y]
const ARMS = [
  ['#3E63D6', 'M-21.7 -78.5L-7.9 -112.3Q0.0 -131.7 6.7 -111.8L36.3 -23.1Q39.4 -13.8 32.4 -6.9L20.1 5.2', -25.7, -68.7],
  ['#10A9EE', 'M68.0 -44.9L104.3 -42.2Q125.3 -40.7 108.4 -28.2L33.1 27.4Q25.3 33.2 16.6 28.7L1.2 20.7', 57.4, -45.6],
  ['#F4663C', 'M63.7 50.8L72.4 86.2Q77.4 106.6 60.3 94.3L-15.8 40.0Q-23.7 34.3 -22.1 24.6L-19.3 7.6', 61.2, 40.5],
  ['#CB3A9C', 'M-28.6 76.3L-59.6 95.5Q-77.4 106.6 -71.1 86.5L-42.9 -2.7Q-39.9 -12.0 -30.2 -13.5L-13.2 -16.0', -19.6, 70.7],
  ['#7643C6', 'M-81.4 -3.6L-109.2 -27.1Q-125.3 -40.7 -104.3 -40.9L-10.7 -41.6Q-0.9 -41.7 3.5 -32.9L11.2 -17.5', -73.3, 3.2],
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
      {ARMS.map(([color, d, cx, cy]) => (
        <g key={color} stroke={color}>
          <path d={d} />
          <circle cx={cx} cy={cy} r="10.0" />
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
