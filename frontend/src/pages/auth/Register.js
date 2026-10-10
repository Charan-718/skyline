import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from './AuthLayout';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Field, Input, required, useForm } from '../../components/forms';
import { Button } from '../../components/Button';
import { Alert } from '../../components/feedback';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../utils/errorMessages';

export default function Register() {
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({ fullName: '', email: '', phoneE164: '', password: '' });

  const register = useMutation({
    mutationFn: (body) => authApi.register(body),
    onSuccess: async () => {
      await refresh();
      toast.success('Account created', 'Verify your student ID from your profile to unlock membership plans.');
      navigate(params.get('next') || '/me/profile', { replace: true });
    },
    onError: (e) => form.applyServerErrors(e),
  });

  if (user) return <Navigate to="/" replace />;

  const submit = (e) => {
    e.preventDefault();
    const ok = form.validate({
      fullName: required('Enter your full name.'),
      email: (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '') ? 'Enter a valid email address.' : null),
      phoneE164: (v) => (v && !/^\+[1-9]\d{7,14}$/.test(v) ? 'Use international format, e.g. +919876543210.' : null),
      password: (v, all) => (!v || v.length < 8 ? 'Use at least 8 characters.' : v.toLowerCase() === all.email.toLowerCase() ? 'Password must differ from your email.' : null),
    });
    if (ok) register.mutate({ ...form.values, phoneE164: form.values.phoneE164 || undefined });
  };

  return (
    <AuthLayout title="Create your account" subtitle="Anyone can sign up and book public events. College students can verify later to join clubs." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
      {register.isError && !Object.keys(register.error?.details?.fields || {}).length && <Alert tone="danger">{errorMessage(register.error)}</Alert>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Full name" error={form.errors.fullName} required>
          <Input autoComplete="name" {...form.bind('fullName')} />
        </Field>
        <Field label="Email" error={form.errors.email} required>
          <Input type="email" autoComplete="email" inputMode="email" {...form.bind('email')} />
        </Field>
        <Field label="Mobile" hint="Optional." error={form.errors.phoneE164}>
          <Input type="tel" autoComplete="tel" placeholder="+919876543210" {...form.bind('phoneE164')} />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={form.errors.password} required>
          <Input type="password" autoComplete="new-password" {...form.bind('password')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={register.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
