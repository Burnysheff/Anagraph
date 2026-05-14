from pathlib import Path

import aiosqlite


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    text_length INTEGER NOT NULL,
    num_chunks INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    triplets_extracted INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    source_path TEXT,
    raw_text TEXT,
    language TEXT,
    used_type_names TEXT
);

CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);

CREATE TABLE IF NOT EXISTS entity_types (
    name TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
);
"""


async def init_database(db_path: str) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(SCHEMA)
        await db.commit()
