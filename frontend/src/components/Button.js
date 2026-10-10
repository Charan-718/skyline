import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

export const Button = forwardRef(function Button(
  { variant = 'secondary', size, icon: Icon, iconRight: IconRight, loading = false, block, to, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  const iconSize = size === 'sm' ? 16 : 18;
  const content = (
    <>
      {loading ? <span className="spinner" aria-hidden /> : Icon && <Icon size={iconSize} aria-hidden />}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden />}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export function IconButton({ icon: Icon, label, size = 20, className = '', ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon size={size} aria-hidden />
    </button>
  );
}
