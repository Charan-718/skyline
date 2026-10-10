import { describe, expect, it } from 'vitest';
import { render } from '../../src/modules/notifications/templates.js';

describe('email HTML templates', () => {
  it('renewal reminder includes html with CTA and plain-text fallback', () => {
    const msg = render('RENEWAL_REMINDER_7D', {
      clubName: 'Skyline Student Association',
      planName: 'Semester',
      expiresOn: '2026-10-18',
      renewUrl: 'http://localhost:3000/me/memberships/abc',
      autopayEnabled: false,
      daysLeft: 7,
    });
    expect(msg.text).toContain('expires in 7 days');
    expect(msg.html).toContain('<!DOCTYPE html>');
    expect(msg.html).toContain('Renew membership');
    expect(msg.html).toContain('http://localhost:3000/me/memberships/abc');
    expect(msg.html).toContain('Campus Flow');
  });
});
