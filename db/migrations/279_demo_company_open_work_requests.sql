-- 279: Demo Company's dashboard counts its OWN open Work Pool requests, and had none open (only the
-- completed one from 277). Add two so the Cooperative card is not blank.
INSERT INTO cooperative_work_requests (org_id, category, title, description, hours_estimate, needed_by, status, created_at, updated_at)
VALUES
  (42, 'bookkeeping',    'Month-end close checklist review', 'A second look at our month-end close steps before the board meeting.', 3.0, current_date + 12, 'open',        now() - interval '2 days', now() - interval '2 days'),
  (42, '990_prep',       'Schedule B donor listing check',   'Confirm the donor listing is complete and correctly categorized.',       2.5, current_date + 26, 'in_progress', now() - interval '9 days', now() - interval '4 days');
