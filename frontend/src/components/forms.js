import { cloneElement, isValidElement, useCallback, useId, useState } from 'react';
import { fieldErrors } from '../utils/errorMessages';

/** Labelled field: wires id, aria-describedby and aria-invalid onto its single child control. */
export function Field({ label, hint, error, required, children, className = '' }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required: required || undefined })
    : children;
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={isValidElement(children) ? children.props.id || id : undefined}>
          {label}
          {required && (
            <span className="req" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {control}
      {hint && !error && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errId} className="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Textarea = (props) => <textarea className="textarea" {...props} />;
export function Select({ options, placeholder, ...props }) {
  return (
    <select className="select" {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function MoneyInput(props) {
  return (
    <div className="input-group">
      <span className="prefix" aria-hidden>
        ₹
      </span>
      <input className="input num" inputMode="decimal" autoComplete="off" placeholder="0.00" {...props} />
    </div>
  );
}

export function Checkbox({ label, hint, ...props }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      <span>
        {label}
        {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Minimal form state: values, per-field errors (client validation on submit + server
 * VALIDATION_FAILED details), and helpers. Business rules are validated by the API.
 */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  const set = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const bind = (name, { type } = {}) => ({
    name,
    value: type === 'checkbox' ? undefined : values[name] ?? '',
    checked: type === 'checkbox' ? !!values[name] : undefined,
    onChange: (e) => set(name, type === 'checkbox' ? e.target.checked : e.target.value),
  });

  const validate = (rules) => {
    const next = {};
    Object.entries(rules).forEach(([k, fn]) => {
      const msg = fn(values[k], values);
      if (msg) next[k] = msg;
    });
    setErrors(next);
    if (Object.keys(next).length) {
      const first = document.querySelector(`[name="${Object.keys(next)[0]}"]`);
      first?.focus();
      return false;
    }
    return true;
  };

  const applyServerErrors = (error) => setErrors((e) => ({ ...e, ...fieldErrors(error) }));

  return { values, setValues, set, bind, errors, setErrors, validate, applyServerErrors, reset: () => setValues(initial) };
}

export const required = (msg = 'Required.') => (v) => (v === undefined || v === null || String(v).trim() === '' ? msg : null);
