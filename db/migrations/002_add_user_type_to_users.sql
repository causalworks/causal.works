-- 002_add_user_type_to_users.sql
-- Add user_type column to users for view modes / roles

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'individual_basic';

