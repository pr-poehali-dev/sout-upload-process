"""
Загрузка файлов карт СОУТ в S3 и создание batch-записи в БД.
Принимает base64-файл, сохраняет в S3, регистрирует в БД.
"""
import json
import os
import base64
import uuid
import psycopg2
import boto3

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p19673764_sout_upload_process")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")

    # GET /  — список батчей (история)
    if method == "GET":
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT b.id, b.name, b.status, b.total_files, b.processed_files,
                   b.created_at, b.finished_at,
                   COUNT(CASE WHEN c.is_dangerous THEN 1 END) AS danger_count,
                   COUNT(CASE WHEN NOT c.is_dangerous THEN 1 END) AS safe_count
            FROM {SCHEMA}.sout_batches b
            LEFT JOIN {SCHEMA}.sout_cards c ON c.batch_id = b.id
            GROUP BY b.id
            ORDER BY b.created_at DESC
            LIMIT 50
        """)
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
        result = []
        for r in rows:
            row = dict(zip(cols, r))
            row["created_at"] = str(row["created_at"])
            row["finished_at"] = str(row["finished_at"]) if row["finished_at"] else None
            result.append(row)
        cur.close()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps(result)}

    # POST / — загрузить файл(ы) и создать batch
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        files = body.get("files", [])  # [{name, data_b64, size}]
        batch_name = body.get("batch_name", "Пакет СОУТ")

        if not files:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Нет файлов"})}

        s3 = get_s3()
        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            f"INSERT INTO {SCHEMA}.sout_batches (name, status, total_files) VALUES (%s, %s, %s) RETURNING id",
            (batch_name, "pending", len(files)),
        )
        batch_id = cur.fetchone()[0]

        file_ids = []
        for f in files:
            name = f.get("name", "file.pdf")
            data_b64 = f.get("data_b64", "")
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else "bin"
            s3_key = f"sout/{batch_id}/{uuid.uuid4().hex}.{ext}"

            try:
                raw = base64.b64decode(data_b64)
                content_type_map = {
                    "pdf": "application/pdf",
                    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "xls": "application/vnd.ms-excel",
                    "doc": "application/msword",
                    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "zip": "application/zip",
                    "rar": "application/x-rar-compressed",
                }
                ct = content_type_map.get(ext, "application/octet-stream")
                s3.put_object(Bucket="files", Key=s3_key, Body=raw, ContentType=ct)
                status = "pending"
                err = None
            except Exception as e:
                s3_key = None
                status = "error"
                err = str(e)

            cur.execute(
                f"INSERT INTO {SCHEMA}.sout_files (batch_id, original_name, s3_key, status, error_msg) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (batch_id, name, s3_key, status, err),
            )
            file_ids.append(cur.fetchone()[0])

        conn.commit()
        cur.close()
        conn.close()

        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"batch_id": batch_id, "file_ids": file_ids, "message": "Файлы загружены"}),
        }

    return {"statusCode": 405, "headers": CORS, "body": json.dumps({"error": "Method not allowed"})}
