-- 015_delete_dismissed_user_actions.sql
-- "Not This Time" no longer uses dismissed_at — remove legacy soft-dismissed rows.
-- (Schema uses dismissed_at, not status.)

DELETE FROM user_actions WHERE dismissed_at IS NOT NULL;
