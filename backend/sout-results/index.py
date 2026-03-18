"""
Получение результатов обработки карт СОУТ.
Возвращает список карт с факторами по batch_id или все карты.
"""
import json
import os
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p19673764_sout_upload_process")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    batch_id = params.get("batch_id")
    direction = params.get("direction")  # "danger" | "safe" | None = all
    search = params.get("search", "").strip()

    conn = get_conn()
    cur = conn.cursor()

    where_parts = []
    args = []

    if batch_id:
        where_parts.append("c.batch_id = %s")
        args.append(batch_id)

    if direction == "danger":
        where_parts.append("c.is_dangerous = TRUE")
    elif direction == "safe":
        where_parts.append("c.is_dangerous = FALSE")

    if search:
        where_parts.append(
            "(c.worker_name ILIKE %s OR c.organization ILIKE %s OR c.department ILIKE %s OR c.position ILIKE %s)"
        )
        like = f"%{search}%"
        args += [like, like, like, like]

    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    cur.execute(f"""
        SELECT c.id, c.batch_id, c.organization, c.department,
               c.worker_name, c.position, c.sout_date, c.is_dangerous, c.created_at
        FROM {SCHEMA}.sout_cards c
        {where_sql}
        ORDER BY c.created_at DESC
        LIMIT 500
    """, args)

    rows = cur.fetchall()
    card_ids = [r[0] for r in rows]

    factors_map: dict = {}
    if card_ids:
        placeholders = ",".join(["%s"] * len(card_ids))
        cur.execute(
            f"SELECT card_id, code, name, description FROM {SCHEMA}.sout_factors WHERE card_id IN ({placeholders}) ORDER BY code",
            card_ids,
        )
        for frow in cur.fetchall():
            cid = frow[0]
            if cid not in factors_map:
                factors_map[cid] = []
            factors_map[cid].append({"code": frow[1], "name": frow[2], "description": frow[3] or ""})

    result = []
    for r in rows:
        cid = r[0]
        result.append({
            "id": cid,
            "batch_id": r[1],
            "organization": r[2] or "",
            "department": r[3] or "",
            "worker_name": r[4] or "",
            "position": r[5] or "",
            "sout_date": r[6] or "",
            "is_dangerous": r[7],
            "created_at": str(r[8]),
            "factors": factors_map.get(cid, []),
        })

    cur.close()
    conn.close()

    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({
            "cards": result,
            "total": len(result),
            "danger_count": sum(1 for c in result if c["is_dangerous"]),
            "safe_count": sum(1 for c in result if not c["is_dangerous"]),
        }),
    }
