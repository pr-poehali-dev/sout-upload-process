-- Устанавливаем пароль Avesta2026! для nshrkonstantin@gmail.com
-- hash = sha256("avesta_sout_2026" + "Avesta2026!" + "avesta_sout_2026")
UPDATE t_p19673764_sout_upload_process.sout_users
SET password_hash = '6bfef31181a4978cb0d64e776879df3e42393223fb40df91eb38a5e43074b529',
    full_name = 'Администратор'
WHERE email = 'nshrkonstantin@gmail.com';
