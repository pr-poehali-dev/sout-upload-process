"""
Админ-панель АВЕСТА: управление пользователями, очистка БД, системная статистика.
Только для пользователей с role='admin'.
GET /stats, GET /users, POST /users, PUT /users/{id}, 
POST /clear/results, POST /clear/history, POST /clear/all
"""
import json, os, hashlib
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

def require_admin(conn, session_id: str):
    cur = conn.cursor()
    cur.execute(f"""
        SELECT u.id, u.email, u.role FROM {SCHEMA}.sout_sessions s
        JOIN {SCHEMA}.sout_users u ON u.id = s.user_id
        WHERE s.id = %s AND s.expires_at > NOW() AND u.role = 'admin' AND u.is_active = TRUE
    """, (session_id,))
    row = cur.fetchone()
    cur.close()
    return row

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = (event.get("path") or "/").rstrip("/")
    session_id = (event.get("headers") or {}).get("X-Session-Id", "")

    conn = get_conn()
    admin = require_admin(conn, session_id)
    if not admin:
        conn.close()
        return resp(403, {"error": "Доступ запрещён. Только для администраторов."})

    cur = conn.cursor()

    # GET /stats — сводная статистика системы
    if method == "GET" and path.endswith("stats"):
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_users WHERE is_active = TRUE")
        users_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_batches")
        batches_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_cards")
        cards_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_cards WHERE is_dangerous = TRUE")
        danger_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_files")
        files_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_sessions WHERE expires_at > NOW()")
        active_sessions = cur.fetchone()[0]
        cur.close(); conn.close()
        return resp(200, {
            "users_count": users_count,
            "batches_count": batches_count,
            "cards_count": cards_count,
            "danger_count": danger_count,
            "safe_count": cards_count - danger_count,
            "files_count": files_count,
            "active_sessions": active_sessions,
        })

    # GET /users — список пользователей
    if method == "GET" and path.endswith("users"):
        cur.execute(f"""
            SELECT id, email, full_name, role, is_active, created_at, last_login_at
            FROM {SCHEMA}.sout_users ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        users = []
        for r in rows:
            users.append({
                "id": r[0], "email": r[1], "full_name": r[2], "role": r[3],
                "is_active": r[4],
                "created_at": str(r[5]),
                "last_login_at": str(r[6]) if r[6] else None,
            })
        cur.close(); conn.close()
        return resp(200, {"users": users})

    body = json.loads(event.get("body") or "{}")

    # POST /users — создать пользователя
    if method == "POST" and path.endswith("users"):
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        full_name = body.get("full_name", "").strip()
        role = body.get("role", "user")
        if not email or not password or not full_name:
            cur.close(); conn.close()
            return resp(400, {"error": "Email, пароль и имя обязательны"})
        if role not in ("user", "admin"):
            role = "user"
        cur.execute(f"SELECT id FROM {SCHEMA}.sout_users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Пользователь с таким email уже существует"})
        pwd_hash = hash_password(password)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sout_users (email, password_hash, full_name, role) VALUES (%s, %s, %s, %s) RETURNING id",
            (email, pwd_hash, full_name, role)
        )
        new_id = cur.fetchone()[0]
        conn.commit(); cur.close(); conn.close()
        return resp(201, {"id": new_id, "email": email, "full_name": full_name, "role": role})

    # PUT /users — обновить пользователя (передать id в теле)
    if method == "PUT" and "users" in path:
        uid = body.get("id")
        if not uid:
            cur.close(); conn.close()
            return resp(400, {"error": "id обязателен"})
        # Нельзя снять права у самого себя
        if str(uid) == str(admin[0]) and body.get("role") != "admin":
            cur.close(); conn.close()
            return resp(400, {"error": "Нельзя снять права администратора у себя"})
        fields = []
        values = []
        if "full_name" in body:
            fields.append("full_name = %s"); values.append(body["full_name"])
        if "role" in body and body["role"] in ("user", "admin"):
            fields.append("role = %s"); values.append(body["role"])
        if "is_active" in body:
            fields.append("is_active = %s"); values.append(bool(body["is_active"]))
        if "password" in body and body["password"]:
            fields.append("password_hash = %s"); values.append(hash_password(body["password"]))
        if not fields:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет полей для обновления"})
        values.append(uid)
        cur.execute(f"UPDATE {SCHEMA}.sout_users SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit(); cur.close(); conn.close()
        return resp(200, {"ok": True})

    # POST /clear/results — очистить результаты (карты и факторы)
    if method == "POST" and path.endswith("results"):
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_factors")
        f_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_cards")
        c_count = cur.fetchone()[0]
        # Удаляем через UPDATE is_dangerous=false — нет, удаляем через truncate-подход
        # Используем DELETE с условием id > 0
        cur.execute(f"DELETE FROM {SCHEMA}.sout_factors WHERE id > 0")
        cur.execute(f"DELETE FROM {SCHEMA}.sout_cards WHERE id > 0")
        conn.commit(); cur.close(); conn.close()
        return resp(200, {"ok": True, "deleted_factors": f_count, "deleted_cards": c_count})

    # POST /clear/history — очистить историю (пакеты и файлы)
    if method == "POST" and path.endswith("history"):
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_batches")
        b_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_files")
        fi_count = cur.fetchone()[0]
        cur.execute(f"DELETE FROM {SCHEMA}.sout_files WHERE id > 0")
        cur.execute(f"DELETE FROM {SCHEMA}.sout_batches WHERE id > 0")
        conn.commit(); cur.close(); conn.close()
        return resp(200, {"ok": True, "deleted_batches": b_count, "deleted_files": fi_count})

    # POST /clear/all — полная очистка данных СОУТ
    if method == "POST" and path.endswith("all"):
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.sout_cards")
        total = cur.fetchone()[0]
        cur.execute(f"DELETE FROM {SCHEMA}.sout_factors WHERE id > 0")
        cur.execute(f"DELETE FROM {SCHEMA}.sout_cards WHERE id > 0")
        cur.execute(f"DELETE FROM {SCHEMA}.sout_files WHERE id > 0")
        cur.execute(f"DELETE FROM {SCHEMA}.sout_batches WHERE id > 0")
        conn.commit(); cur.close(); conn.close()
        return resp(200, {"ok": True, "message": f"База данных СОУТ полностью очищена. Удалено карт: {total}"})

    cur.close(); conn.close()
    return resp(404, {"error": "Not found"})
