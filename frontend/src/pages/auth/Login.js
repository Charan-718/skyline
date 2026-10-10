import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import AuthLayout from './AuthLayout';
import { authApi } from '../../api/endpoints';
import { SHOW_DEMO_LOGINS } from '../../api/config';
import { useAuth } from '../../auth/AuthProvider';
import { Field, Input, required, useForm } from '../../components/forms';
import { Button } from '../../components/Button';
import { Alert } from '../../components/feedback';
import { Avatar } from '../../components/domain';
import { errorMessage } from '../../utils/errorMessages';

const DEMO_ACCOUNTS = [
  { email: 'asha@skyline.ac.in', name: 'Asha Rao', role: 'Club head · Skyline; volunteer · Robotics' },
  { email: 'ravi@skyline.ac.in', name: 'Ravi Kumar', role: 'Treasurer · Skyline' },
  { email: 'meera@skyline.ac.in', name: 'Meera Iyer', role: 'Volunteer & event staff · Skyline' },
  { email: 'karthik@skyline.ac.in', name: 'Karthik Reddy', role: 'Club head · Photography; treasurer · Robotics; event organizer' },
  { email: 'vikram@skyline.ac.in', name: 'Vikram Shetty', role: 'Club head · Robotics' },
  { email: 'priya.nair@gmail.com', name: 'Priya Nair', role: 'Non-member, not yet verified' },
];

export default function Login() {
  const { user, setSession } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';
  const [showPw, setShowPw] = useState(false);
  const form = useForm({ email: '', password: '' });

  const login = useMutation({
    mutationFn: (body) => authApi.login(body),
    onSuccess: (data) => {
      setSession(data);
      navigate(next, { replace: true });
    },
  });

  if (user) return <Navigate to={next} replace />;

  const submit = (e) => {
    e.preventDefault();
    if (!form.validate({ email: required('Enter your email.'), password: required('Enter your password.') })) return;
    login.mutate(form.values);
  };

  return (
    <AuthLayout title="Sign in" subtitle="Manage memberships, tickets, orders and club work in one place." footer={<>New here? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}>
      {login.isError && <Alert tone="danger">{errorMessage(login.error)}</Alert>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Email" error={form.errors.email} required>
          <Input type="email" autoComplete="username" inputMode="email" {...form.bind('email')} />
        </Field>
        <Field label="Password" error={form.errors.password} required>
          <div className="input-group">
            <Input type={showPw ? 'text' : 'password'} autoComplete="current-password" style={{ paddingRight: 44 }} {...form.bind('password')} />
            <button type="button" className="icon-btn" style={{ position: 'absolute', right: 0 }} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onClick={() => setShowPw((s) => !s)}>
              {showPw ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={login.isPending}>
          Sign in
        </Button>
      </form>
      {SHOW_DEMO_LOGINS && (
        <div className="stack-sm">
          <hr className="divider" style={{ margin: '4px 0' }} />
          <div className="label">Demo accounts</div>
          <p className="subtle">Each account shows a different role. Password for all: <span className="mono">demo1234</span></p>
          <div className="demo-accounts">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" disabled={login.isPending} onClick={() => login.mutate({ email: a.email, password: 'demo1234' })}>
                <Avatar name={a.name} />
                <span>
                  <span className="cell-title" style={{ display: 'block' }}>{a.name}</span>
                  <span className="cell-sub">{a.role}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
