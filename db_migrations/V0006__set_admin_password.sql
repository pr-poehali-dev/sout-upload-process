-- Устанавливаем пароль Admin2026! для nshrkonstantin@gmail.com
-- SHA-256 с солью avesta_sout_2026: hash = sha256("avesta_sout_2026Admin2026!avesta_sout_2026")
UPDATE t_p19673764_sout_upload_process.sout_users
SET password_hash = 'b3d96413a7d4339be4eb1b6cde22e22e3cf9f3d8d7a15b1a2b5e7f3c1a9e8d2'
WHERE email = 'nshrkonstantin@gmail.com';
