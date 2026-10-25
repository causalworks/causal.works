-- 378: records when the assistant's model step last looked at a bank line, so a line it could not settle is not sent again on every run.

ALTER TABLE org_bank_statement_lines ADD COLUMN model_tried_at timestamptz;
