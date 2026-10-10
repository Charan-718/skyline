import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout';
import { Alert } from '../../components/feedback';

export default function Terms() {
  return (
    <>
      <PageHeader title="Terms of use" description="The rules for using Campus Flow, written in plain language." />
      <div className="prose">
        <Alert tone="info">Draft for review by the college and club leadership before launch. Last updated October 2026.</Alert>

        <h2>Who can use Campus Flow</h2>
        <p>Anyone can create an account to browse clubs, read public announcements, book events that are open to non-members and buy merchandise that clubs make available to everyone.</p>
        <p>Membership plans are offered only to people verified as current students of the college. Verification checks your student ID and name against college records.</p>

        <h2>Club roles</h2>
        <ul>
          <li>Club heads manage their club's events, plans, merchandise, announcements and team roles.</li>
          <li>Treasurers record income and expenses, manage budgets and review reimbursement claims.</li>
          <li>Volunteers work on fundraiser tasks, may scan tickets at events they are assigned to, and can submit reimbursement claims.</li>
        </ul>
        <p>Roles apply to one club only. You can hold different roles in different clubs.</p>

        <h2>Payments</h2>
        <p>Payments in this version of Campus Flow are simulated. No money moves through the platform, and no card or bank details are collected. Membership fees, ticket prices and merchandise totals shown at checkout are calculated by the server and recorded with each purchase.</p>
        <p>Refunds are not processed in the platform. If an event is cancelled, the club settles refunds offline.</p>

        <h2>Tickets and pickup codes</h2>
        <p>Each ticket admits one person once. Ticket QR codes and pickup codes are personal. Do not share screenshots of them, since the first scan or pickup uses them up.</p>

        <h2>Acceptable use</h2>
        <ul>
          <li>Do not submit expenses or receipts that are not genuine.</li>
          <li>Do not try to access another club's records or another person's account.</li>
          <li>Announcements must follow the college's code of conduct.</li>
        </ul>

        <h2>Records</h2>
        <p>Financial records, payments, check-ins and the audit log are kept permanently and are never deleted, so every club's accounts can be checked later.</p>

        <h2>Questions</h2>
        <p>Contact your club head, or read the <Link to="/privacy">privacy policy</Link> for how your information is handled.</p>
      </div>
    </>
  );
}
