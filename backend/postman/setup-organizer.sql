-- Run after creating an event (before POST .../publish).
-- Replace placeholders with your UUIDs / email from Postman env.

INSERT INTO event_organizers (event_id, user_id, assigned_by)
SELECT
  'YOUR_EVENT_ID'::uuid,
  u.id,
  u.id
FROM users u
WHERE lower(u.email) = lower('clubhead@skyline.ac.in')
ON CONFLICT DO NOTHING;
