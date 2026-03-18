INSERT INTO t_p19673764_sout_upload_process.sout_users (email, password_hash, full_name, role)
SELECT 'nshrkonstantin@gmail.com', 'c3f69b3a5e8b1d2a4f6e0c9b7a5d3e1f2c4b6a8d0e2f4c6a8b0d2e4f6a8c0b2', 'Константин', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM t_p19673764_sout_upload_process.sout_users WHERE email = 'nshrkonstantin@gmail.com');
