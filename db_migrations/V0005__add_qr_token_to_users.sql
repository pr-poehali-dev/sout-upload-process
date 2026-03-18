ALTER TABLE t_p19673764_sout_upload_process.sout_users
ADD COLUMN IF NOT EXISTS qr_token TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_qr_token
ON t_p19673764_sout_upload_process.sout_users(qr_token)
WHERE qr_token IS NOT NULL;
