"""
Обработка карт СОУТ: извлечение данных из текста файлов и классификация факторов.
Запускается по batch_id. Читает файлы из S3, парсит, сохраняет карты в БД.
"""
import json
import os
import re
import io
import psycopg2
import boto3

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p19673764_sout_upload_process")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token",
}

# Классификатор вредных факторов (по Приказу Минтруда № 33н)
FACTOR_CLASSIFIER = [
    {"code": "3.1", "name": "Химический", "keywords": ["химическ", "аэрозол", "газ", "пар", "пыль", "вещество", "концентраци", "пдк", "выброс"]},
    {"code": "3.2", "name": "Биологический", "keywords": ["биологическ", "микроорганизм", "бактери", "вирус", "инфекц", "патоген", "микроб"]},
    {"code": "3.3", "name": "Физический (шум/вибрация)", "keywords": ["шум", "вибраци", "излучен", "радиаци", "электромагнит", "ультразвук", "инфразвук", "дба", "дб"]},
    {"code": "3.4", "name": "Тяжесть трудового процесса", "keywords": ["тяжест", "физическ нагрузк", "подъем", "перемещен", "масс груз", "статическ", "рабочая поза", "наклон"]},
    {"code": "3.5", "name": "Напряжённость трудового процесса", "keywords": ["напряженност", "интеллектуальн", "сенсорн", "эмоциональн", "монотонн", "режим труда", "нагрузк на зрен"]},
    {"code": "4.0", "name": "Опасный класс", "keywords": ["опасн", "класс 4", "4 класс", "чрезвычайно опасн"]},
]

# Паттерны для поиска в тексте
ORG_PATTERNS = [
    r'(?:организация|работодатель|наименование организации)[:\s]+([^\n\r]{3,80})',
    r'(?:ООО|АО|ПАО|ОАО|ФГУП|МКУ|МБУ|ГБУ|ГАУ|ГБУЗ|ИП)\s+[«"]?([^»"\n\r]{3,60})',
]
DEPT_PATTERNS = [
    r'(?:подразделение|структурное подразделение|цех|отдел|участок)[:\s]+([^\n\r]{3,80})',
    r'(?:участок|лаборатори|служб)[:\s]+([^\n\r]{3,60})',
]
NAME_PATTERNS = [
    r'(?:фио|ф\.и\.о\.|работник|ф\.и\.о работника)[:\s]+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)',
    r'([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)',
]
POSITION_PATTERNS = [
    r'(?:должность|профессия|наименование должности)[:\s]+([^\n\r]{3,80})',
    r'(?:специальност)[ь]?[:\s]+([^\n\r]{3,60})',
]
DATE_PATTERNS = [
    r'(?:дата проведения|дата|проведен)[:\s]+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})',
    r'(\d{1,2}\.\d{1,2}\.\d{4})',
]
DANGER_PATTERNS = [
    r'класс\s+(?:условий труда\s+)?[:\s]*([34](?:\.[1-5])?)',
    r'итоговый класс[:\s]+([34])',
    r'вредн|опасн',
]


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def extract_text_from_bytes(data: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    text = ""
    try:
        if ext == "pdf":
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(data)) as pdf:
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            text += t + "\n"
            except Exception:
                text = data.decode("utf-8", errors="ignore")
        elif ext in ("xlsx", "xls"):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
                for ws in wb.worksheets:
                    for row in ws.iter_rows(values_only=True):
                        line = " ".join(str(c) for c in row if c is not None)
                        if line.strip():
                            text += line + "\n"
            except Exception:
                text = data.decode("utf-8", errors="ignore")
        elif ext in ("doc", "docx"):
            try:
                import docx
                doc = docx.Document(io.BytesIO(data))
                text = "\n".join(p.text for p in doc.paragraphs)
            except Exception:
                text = data.decode("utf-8", errors="ignore")
        else:
            text = data.decode("utf-8", errors="ignore")
    except Exception:
        text = ""
    return text


def find_pattern(text: str, patterns: list) -> str:
    text_lower = text.lower()
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
        if m:
            val = m.group(1).strip() if m.lastindex else m.group(0).strip()
            val = re.sub(r'\s+', ' ', val)
            if len(val) > 2:
                return val[:200]
    return ""


def classify_factors(text: str) -> list:
    text_lower = text.lower()
    found = []
    for f in FACTOR_CLASSIFIER:
        for kw in f["keywords"]:
            if kw in text_lower:
                desc = extract_factor_context(text_lower, kw)
                found.append({"code": f["code"], "name": f["name"], "description": desc})
                break
    return found


def extract_factor_context(text: str, keyword: str) -> str:
    idx = text.find(keyword)
    if idx == -1:
        return ""
    start = max(0, idx - 30)
    end = min(len(text), idx + 120)
    snippet = text[start:end].strip()
    snippet = re.sub(r'\s+', ' ', snippet)
    return snippet[:250].capitalize()


def is_dangerous(text: str, factors: list) -> bool:
    text_lower = text.lower()
    for pat in DANGER_PATTERNS:
        if re.search(pat, text_lower):
            return True
    if len(factors) >= 1:
        return True
    return False


def parse_card(text: str, filename: str) -> dict:
    org = find_pattern(text, ORG_PATTERNS)
    dept = find_pattern(text, DEPT_PATTERNS)
    name = find_pattern(text, NAME_PATTERNS)
    position = find_pattern(text, POSITION_PATTERNS)
    date = find_pattern(text, DATE_PATTERNS)
    factors = classify_factors(text)
    dangerous = is_dangerous(text, factors)

    if not org:
        org = filename.replace("_", " ").replace("-", " ").split(".")[0][:80]

    return {
        "organization": org or "Не определено",
        "department": dept or "Не определено",
        "worker_name": name or "Не определено",
        "position": position or "Не определено",
        "sout_date": date or "",
        "is_dangerous": dangerous,
        "factors": factors,
    }


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "POST")

    # GET /?batch_id=X — статус батча
    if method == "GET":
        params = event.get("queryStringParameters") or {}
        batch_id = params.get("batch_id")
        if not batch_id:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "batch_id required"})}
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT status, total_files, processed_files FROM {SCHEMA}.sout_batches WHERE id = %s",
            (batch_id,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Batch not found"})}
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({
            "status": row[0], "total_files": row[1], "processed_files": row[2],
            "progress": int(row[2] / row[1] * 100) if row[1] else 0
        })}

    # POST / — запустить обработку batch
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        batch_id = body.get("batch_id")
        if not batch_id:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "batch_id required"})}

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            f"UPDATE {SCHEMA}.sout_batches SET status = 'processing' WHERE id = %s",
            (batch_id,)
        )
        conn.commit()

        cur.execute(
            f"SELECT id, original_name, s3_key FROM {SCHEMA}.sout_files WHERE batch_id = %s AND status = 'pending'",
            (batch_id,)
        )
        files = cur.fetchall()

        s3 = get_s3()
        processed = 0

        for file_id, filename, s3_key in files:
            try:
                cur.execute(
                    f"UPDATE {SCHEMA}.sout_files SET status = 'processing' WHERE id = %s",
                    (file_id,)
                )
                conn.commit()

                if s3_key:
                    obj = s3.get_object(Bucket="files", Key=s3_key)
                    data = obj["Body"].read()
                    text = extract_text_from_bytes(data, filename)
                else:
                    text = filename

                card = parse_card(text, filename)

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.sout_cards
                        (batch_id, file_id, organization, department, worker_name, position, sout_date, is_dangerous, raw_text)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (
                        batch_id, file_id,
                        card["organization"], card["department"],
                        card["worker_name"], card["position"],
                        card["sout_date"], card["is_dangerous"],
                        text[:5000],
                    )
                )
                card_id = cur.fetchone()[0]

                for f in card["factors"]:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.sout_factors (card_id, code, name, description) VALUES (%s, %s, %s, %s)",
                        (card_id, f["code"], f["name"], f.get("description", "")),
                    )

                cur.execute(
                    f"UPDATE {SCHEMA}.sout_files SET status = 'done' WHERE id = %s",
                    (file_id,)
                )
                processed += 1

            except Exception as e:
                cur.execute(
                    f"UPDATE {SCHEMA}.sout_files SET status = 'error', error_msg = %s WHERE id = %s",
                    (str(e)[:500], file_id)
                )

            cur.execute(
                f"UPDATE {SCHEMA}.sout_batches SET processed_files = %s WHERE id = %s",
                (processed, batch_id)
            )
            conn.commit()

        cur.execute(
            f"UPDATE {SCHEMA}.sout_batches SET status = 'done', finished_at = NOW(), processed_files = %s WHERE id = %s",
            (processed, batch_id)
        )
        conn.commit()
        cur.close()
        conn.close()

        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"message": "Обработка завершена", "processed": processed}),
        }

    return {"statusCode": 405, "headers": CORS, "body": json.dumps({"error": "Method not allowed"})}
