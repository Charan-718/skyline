import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Alert } from '../../components/feedback';

export default function Privacy() {
  return (
    <>
      <PageHeader title="Privacy policy" description="What Campus Flow stores about you, who can see it, and why." />
      <div className="prose">
        <Alert tone="info">Draft for review by the college before launch. Last updated October 2026.</Alert>

        <h2>What we store</h2>
        <ul>
          <li>Your name, email address and, if you add it, your mobile number.</li>
          <li>Your password, stored only as a one-way hash. It is never shown or logged.</li>
          <li>The outcome of your student verification. Your student ID itself is stored only as a salted hash, never in readable form.</li>
          <li>Your memberships, bookings, tickets, orders, payments and reimbursement claims, including receipts you upload.</li>
        </ul>

        <h2>Why we store it</h2>
        <p>To run club memberships, issue and check tickets, fulfil merchandise orders, keep accurate club accounts, and send you the messages described below.</p>

        <h2>Who can see it</h2>
        <ul>
          <li>You can see everything about your own account.</li>
          <li>Club heads and treasurers can see their own club's member list, bookings, orders and finances. They cannot see other clubs' records.</li>
          <li>Event staff scanning tickets see only the attendee's name and ticket type, not contact details or amounts paid.</li>
          <li>Receipts are visible only to you and your club's treasurer and head.</li>
        </ul>

        <h2>Messages</h2>
        <p>We send email for announcements from clubs you belong to, booking confirmations, and low-stock alerts for club heads. If you add a mobile number, we send one WhatsApp reminder seven days before your membership expires. We do not send marketing.</p>

        <h2>QR codes</h2>
        <p>Ticket and membership QR codes contain only a random code, not your name or any other personal detail. You can issue a new membership QR code at any time from your digital ID.</p>

        <h2>Retention</h2>
        <p>Financial records, payments and check-ins are kept permanently so club accounts can be audited. Contact your club head if you want your account closed.</p>

        <p>See also the <Link to="/terms">terms of use</Link>.</p>
      </div>
    </>
  );
}
