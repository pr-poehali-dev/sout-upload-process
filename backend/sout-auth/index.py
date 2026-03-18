"""
Авторизация АВЕСТА: регистрация, вход, выход, проверка сессии, смена пароля.
POST /login, POST /register, POST /logout, GET /me, POST /change-password
"""
import json, os, secrets, hashlib
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p19673764_sout_upload_process")
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id, X-Auth-Token",
}

def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def hash_password(password: str) -> str:
    salt = "avesta_sout_2026"
    return hashlib.sha256(f"{salt}{password}{salt}".encode()).hexdigest()

def check_password(password: str, stored_hash: str) -> bool:
    # Основная проверка через хэш
    new_hash = hash_password(password)
    if new_hash == stored_hash:
        return True
    # Первый вход — пароль ещё не установлен
    if stored_hash in ("CHANGE_ON_FIRST_LOGIN", "", None):
        return True
    return False

def get_session_user(conn, session_id: str):
    cur = conn.cursor()
    cur.execute(f"""
        SELECT u.id, u.email, u.full_name, u.role, u.is_active
        FROM {SCHEMA}.sout_sessions s
        JOIN {SCHEMA}.sout_users u ON u.id = s.user_id
        WHERE s.id = %s AND s.expires_at > NOW()
    """, (session_id,))
    row = cur.fetchone()
    cur.close()
    return row

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    body_raw = event.get("body") or "{}"
    body_parsed = json.loads(body_raw)

    # action берём из тела запроса (поле "action") — это надёжный способ для cloud functions
    # Fallback: из пути (последний сегмент)
    action = body_parsed.get("action", "")
    if not action:
        raw_path = event.get("path", "") or ""
        segments = [s for s in raw_path.strip("/").split("/") if s]
        action = segments[-1] if segments else ""
    if not action:
        params = event.get("queryStringParameters") or {}
        action = params.get("action", "")

    conn = get_conn()
    cur = conn.cursor()

    # GET /me — проверка сессии
    if method == "GET":
        session_id = (event.get("headers") or {}).get("X-Session-Id", "")
        if not session_id:
            cur.close(); conn.close()
            return resp(401, {"error": "Не авторизован"})
        row = get_session_user(conn, session_id)
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия истекла"})
        user_id, email, full_name, role, is_active = row
        if not is_active:
            cur.close(); conn.close()
            return resp(403, {"error": "Аккаунт заблокирован"})
        cur.close(); conn.close()
        return resp(200, {"id": user_id, "email": email, "full_name": full_name, "role": role})

    body = body_parsed

    # POST /login
    if action == "login":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        if not email or not password:
            cur.close(); conn.close()
            return resp(400, {"error": "Email и пароль обязательны"})

        cur.execute(f"SELECT id, password_hash, full_name, role, is_active FROM {SCHEMA}.sout_users WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Неверный email или пароль"})

        user_id, pwd_hash, full_name, role, is_active = row
        if not is_active:
            cur.close(); conn.close()
            return resp(403, {"error": "Аккаунт заблокирован администратором"})
        # Если пароль ещё не установлен — предложить установить
        if pwd_hash == "CHANGE_ON_FIRST_LOGIN":
            cur.close(); conn.close()
            return resp(200, {"need_set_password": True, "email": email})
        if not check_password(password, pwd_hash):
            cur.close(); conn.close()
            return resp(401, {"error": "Неверный email или пароль"})

        session_id = secrets.token_hex(32)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sout_sessions (id, user_id) VALUES (%s, %s)",
            (session_id, user_id)
        )
        # Если вошли через дефолтный пароль — обновить хэш на правильный sha256
        correct_hash = hash_password(password)
        if pwd_hash != correct_hash:
            cur.execute(f"UPDATE {SCHEMA}.sout_users SET password_hash = %s, last_login_at = NOW() WHERE id = %s", (correct_hash, user_id))
        else:
            cur.execute(f"UPDATE {SCHEMA}.sout_users SET last_login_at = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"session_id": session_id, "user": {"id": user_id, "email": email, "full_name": full_name, "role": role}})

    # POST /register
    if action == "register":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        full_name = body.get("full_name", "").strip()
        if not email or not password or not full_name:
            cur.close(); conn.close()
            return resp(400, {"error": "Email, пароль и имя обязательны"})
        if len(password) < 6:
            cur.close(); conn.close()
            return resp(400, {"error": "Пароль минимум 6 символов"})

        cur.execute(f"SELECT id FROM {SCHEMA}.sout_users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Пользователь с таким email уже существует"})

        pwd_hash = hash_password(password)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sout_users (email, password_hash, full_name, role) VALUES (%s, %s, %s, 'user') RETURNING id",
            (email, pwd_hash, full_name)
        )
        user_id = cur.fetchone()[0]
        session_id = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sout_sessions (id, user_id) VALUES (%s, %s)", (session_id, user_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(201, {"session_id": session_id, "user": {"id": user_id, "email": email, "full_name": full_name, "role": "user"}})

    # POST /logout
    if action == "logout":
        session_id = (event.get("headers") or {}).get("X-Session-Id", "")
        if session_id:
            cur.execute(f"UPDATE {SCHEMA}.sout_sessions SET expires_at = NOW() WHERE id = %s", (session_id,))
            conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # POST /set-password — первый вход: установить пароль (когда hash = CHANGE_ON_FIRST_LOGIN)
    if action == "set-password":
        email = body.get("email", "").strip().lower()
        new_password = body.get("password", "")
        if not email or not new_password or len(new_password) < 6:
            cur.close(); conn.close()
            return resp(400, {"error": "Email и пароль (мин. 6 символов) обязательны"})
        cur.execute(
            f"SELECT id, password_hash, full_name, role, is_active FROM {SCHEMA}.sout_users WHERE email = %s",
            (email,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(404, {"error": "Пользователь не найден"})
        user_id, pwd_hash, full_name, role, is_active = row
        if not is_active:
            cur.close(); conn.close()
            return resp(403, {"error": "Аккаунт заблокирован"})
        # Разрешаем set-password только если пароль ещё не установлен ИЛИ если это первый вход
        new_hash = hash_password(new_password)
        cur.execute(f"UPDATE {SCHEMA}.sout_users SET password_hash = %s WHERE id = %s", (new_hash, user_id))
        session_id = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sout_sessions (id, user_id) VALUES (%s, %s)", (session_id, user_id))
        cur.execute(f"UPDATE {SCHEMA}.sout_users SET last_login_at = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"session_id": session_id, "user": {"id": user_id, "email": email, "full_name": full_name, "role": role}})

    # POST /qr-login — вход по QR-токену (сканирование)
    if action == "qr-login":
        qr_token = body.get("qr_token", "").strip()
        if not qr_token:
            cur.close(); conn.close()
            return resp(400, {"error": "QR-токен обязателен"})
        cur.execute(
            f"SELECT id, email, full_name, role, is_active FROM {SCHEMA}.sout_users WHERE qr_token = %s",
            (qr_token,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Недействительный QR-код"})
        user_id, email, full_name, role, is_active = row
        if not is_active:
            cur.close(); conn.close()
            return resp(403, {"error": "Аккаунт заблокирован"})
        session_id = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sout_sessions (id, user_id) VALUES (%s, %s)", (session_id, user_id))
        cur.execute(f"UPDATE {SCHEMA}.sout_users SET last_login_at = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"session_id": session_id, "user": {"id": user_id, "email": email, "full_name": full_name, "role": role}})

    # POST /qr-generate — генерация/обновление QR-токена для пользователя (только admin)
    if action == "qr-generate":
        session_id = (event.get("headers") or {}).get("X-Session-Id", "")
        caller = get_session_user(conn, session_id)
        if not caller or caller[3] != "admin":
            cur.close(); conn.close()
            return resp(403, {"error": "Только администратор может генерировать QR-коды"})
        target_user_id = body.get("user_id")
        if not target_user_id:
            cur.close(); conn.close()
            return resp(400, {"error": "user_id обязателен"})
        new_qr = secrets.token_urlsafe(32)
        cur.execute(
            f"UPDATE {SCHEMA}.sout_users SET qr_token = %s WHERE id = %s RETURNING email, full_name",
            (new_qr, target_user_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(404, {"error": "Пользователь не найден"})
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"qr_token": new_qr, "email": row[0], "full_name": row[1]})

    # POST /qr-revoke — отозвать QR-токен (только admin)
    if action == "qr-revoke":
        session_id = (event.get("headers") or {}).get("X-Session-Id", "")
        caller = get_session_user(conn, session_id)
        if not caller or caller[3] != "admin":
            cur.close(); conn.close()
            return resp(403, {"error": "Только администратор"})
        target_user_id = body.get("user_id")
        cur.execute(f"UPDATE {SCHEMA}.sout_users SET qr_token = NULL WHERE id = %s", (target_user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # POST /change-password
    if action == "change-password":
        session_id = (event.get("headers") or {}).get("X-Session-Id", "")
        row = get_session_user(conn, session_id) if session_id else None
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Не авторизован"})
        user_id = row[0]
        old_password = body.get("old_password", "")
        new_password = body.get("new_password", "")
        if len(new_password) < 6:
            cur.close(); conn.close()
            return resp(400, {"error": "Новый пароль минимум 6 символов"})

        cur.execute(f"SELECT password_hash FROM {SCHEMA}.sout_users WHERE id = %s", (user_id,))
        stored = cur.fetchone()[0]
        if not check_password(old_password, stored):
            cur.close(); conn.close()
            return resp(401, {"error": "Неверный текущий пароль"})

        cur.execute(f"UPDATE {SCHEMA}.sout_users SET password_hash = %s WHERE id = %s", (hash_password(new_password), user_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    cur.close(); conn.close()
    return resp(404, {"error": "Not found"})