// One map for every status label + tone so badges are consistent everywhere.
const S = (label, tone) => ({ label, tone });

export const STATUS = {
  // memberships / terms
  ACTIVE: S('Active', 'success'), EXPIRED: S('Expired', 'warning'), PENDING_PAYMENT: S('Awaiting payment', 'warning'), CANCELLED: S('Cancelled', 'neutral'),
  PAID: S('Paid', 'success'), FAILED: S('Failed', 'danger'), ARCHIVED: S('Archived', 'neutral'),
  // payments
  INITIATED: S('Initiated', 'info'), PENDING: S('Pending', 'warning'), SUCCEEDED: S('Succeeded', 'success'),
  // events / bookings / tickets
  DRAFT: S('Draft', 'info'), PUBLISHED: S('Published', 'success'), COMPLETED: S('Completed', 'neutral'),
  CONFIRMED: S('Confirmed', 'success'), VALID: S('Valid', 'success'), USED: S('Checked in', 'primary'),
  NOT_OPEN: S('Not open yet', 'neutral'), EARLY_ACCESS: S('Member early access', 'accent'), OPEN: S('Open', 'success'), SOLD_OUT: S('Sold out', 'danger'), CLOSED: S('Closed', 'neutral'),
  // orders / merch
  PICKED_UP: S('Picked up', 'primary'), INACTIVE: S('Inactive', 'neutral'), RESOLVED: S('Resolved', 'neutral'),
  // announcements / deliveries
  SENT: S('Sent', 'success'), SENDING: S('Sending', 'info'), SKIPPED: S('Skipped', 'neutral'),
  // fundraisers / tasks
  PLANNING: S('Planning', 'info'), TODO: S('To do', 'neutral'), IN_PROGRESS: S('In progress', 'info'), DONE: S('Done', 'success'),
  ON_TRACK: S('On track', 'success'), AT_RISK: S('At risk', 'warning'), OFF_TRACK: S('Off track', 'danger'), NO_TASKS: S('No tasks', 'neutral'),
  // expenses
  SUBMITTED: S('Awaiting review', 'warning'), APPROVED: S('Approved, unpaid', 'info'), REJECTED: S('Rejected', 'danger'),
  // verification
  VERIFIED: S('Verified student', 'success'), NOT_VERIFIED: S('Not verified', 'warning'), NONE: S('Not verified', 'neutral'), UNAVAILABLE: S('Service unavailable', 'warning'),
  // ledger
  IN: S('Income', 'success'), OUT: S('Expense', 'accent'),
};

export const statusOf = (s) => STATUS[s] || { label: String(s || '–').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), tone: 'neutral' };

export const LABELS = {
  role: { CLUB_HEAD: 'Club head', TREASURER: 'Treasurer', VOLUNTEER: 'Volunteer' },
  category: { MEETING: 'Meeting', DEADLINE: 'Deadline', EVENT: 'Event', SCHEDULE_CHANGE: 'Schedule change', GENERAL: 'General' },
  audience: { PUBLIC: 'Everyone', MEMBERS: 'Members only' },
  ledgerCategory: {
    MEMBERSHIP_DUES: 'Membership dues', MEMBERSHIP_RENEWAL: 'Renewals', TICKET_SALE: 'Ticket sales', MERCH_SALE: 'Merchandise',
    FUNDRAISER_INCOME: 'Fundraiser income', REIMBURSEMENT_PAYOUT: 'Reimbursements', DIRECT_EXPENSE: 'Direct expenses',
  },
  priceTier: { MEMBER_REGULAR: 'Member price', NON_MEMBER_REGULAR: 'Standard price', MEMBER_EARLY_BIRD: 'Member early-bird', NON_MEMBER_EARLY_BIRD: 'Early-bird', FREE: 'Free' },
  purpose: { MEMBERSHIP_JOIN: 'Membership', MEMBERSHIP_RENEWAL: 'Renewal', EVENT_TICKET: 'Event ticket', MERCH_ORDER: 'Merchandise' },
  buyerType: { MEMBER: 'Member', NON_MEMBER: 'Non-member' },
  expenseKind: { REIMBURSEMENT: 'Reimbursement', DIRECT: 'Direct expense' },
  template: { ANNOUNCEMENT: 'Announcement', RENEWAL_REMINDER_7D: '7-day renewal reminder', AUTOPAY_RESULT: 'AutoPay result', BOOKING_CONFIRMED: 'Booking confirmation', LOW_STOCK_ALERT: 'Low-stock alert' },
  size: { ONE_SIZE: 'One size' },
};

export const label = (group, key) => LABELS[group]?.[key] || statusOf(key).label;
export const sizeLabel = (s) => LABELS.size[s] || s;
