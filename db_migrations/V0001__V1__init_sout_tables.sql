CREATE TABLE IF NOT EXISTS t_p19673764_sout_upload_process.sout_batches (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_files INT NOT NULL DEFAULT 0,
    processed_files INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS t_p19673764_sout_upload_process.sout_files (
    id SERIAL PRIMARY KEY,
    batch_id INT NOT NULL REFERENCES t_p19673764_sout_upload_process.sout_batches(id),
    original_name TEXT NOT NULL,
    s3_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_msg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p19673764_sout_upload_process.sout_cards (
    id SERIAL PRIMARY KEY,
    batch_id INT NOT NULL REFERENCES t_p19673764_sout_upload_process.sout_batches(id),
    file_id INT REFERENCES t_p19673764_sout_upload_process.sout_files(id),
    organization TEXT,
    department TEXT,
    worker_name TEXT,
    position TEXT,
    sout_date TEXT,
    is_dangerous BOOLEAN NOT NULL DEFAULT FALSE,
    raw_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p19673764_sout_upload_process.sout_factors (
    id SERIAL PRIMARY KEY,
    card_id INT NOT NULL REFERENCES t_p19673764_sout_upload_process.sout_cards(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT
);

CREATE INDEX IF NOT EXISTS idx_sout_cards_batch ON t_p19673764_sout_upload_process.sout_cards(batch_id);
CREATE INDEX IF NOT EXISTS idx_sout_cards_dangerous ON t_p19673764_sout_upload_process.sout_cards(is_dangerous);
CREATE INDEX IF NOT EXISTS idx_sout_factors_card ON t_p19673764_sout_upload_process.sout_factors(card_id);
CREATE INDEX IF NOT EXISTS idx_sout_files_batch ON t_p19673764_sout_upload_process.sout_files(batch_id);
