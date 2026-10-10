/** Shared college identity for PostgreSQL seeds (live API demo). */
export const COLLEGE_DOMAIN = 'skyline.ac.in';

export const CORE_TEAM_EMAILS = [
  'asha@skyline.ac.in',
  'ravi@skyline.ac.in',
  'meera@skyline.ac.in',
  'karthik@skyline.ac.in',
  'vikram@skyline.ac.in',
];

export const STUDENT_FIRST = [
  'Aarav', 'Diya', 'Vihaan', 'Ananya', 'Ishaan', 'Saanvi', 'Arjun', 'Kavya', 'Rohan', 'Nisha',
  'Aditya', 'Pooja', 'Neha', 'Siddharth', 'Lakshmi', 'Manish', 'Deepa', 'Harish', 'Swati', 'Gopal',
];

export const STUDENT_LAST = [
  'Sharma', 'Reddy', 'Iyer', 'Varma', 'Naidu', 'Menon', 'Rao', 'Pillai', 'Krishnan', 'Desai',
];

export function studentEmail(first, last, suffix = '') {
  const local = `${first}.${last}${suffix}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${local}@${COLLEGE_DOMAIN}`;
}

export function studentRoll(year, dept, seq) {
  return `SKY${year}${dept}${String(seq).padStart(3, '0')}`;
}
