import json
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncIterator, Protocol, runtime_checkable

import aiosqlite

from models.document import Document


@runtime_checkable
class DocumentRepository(Protocol):
    async def save(self, doc: Document) -> None: ...
    async def get(self, doc_id: str) -> Document | None: ...
    async def get_all(self) -> list[Document]: ...
    async def update(self, doc: Document) -> None: ...
    async def delete(self, doc_id: str) -> None: ...


_COLUMNS = (
    "id, filename, text_length, num_chunks, status, created_at, "
    "triplets_extracted, error_message, source_path, raw_text, "
    "language, used_type_names"
)


def _row_to_document(row: aiosqlite.Row) -> Document:
    used_types_raw = row["used_type_names"]
    return Document(
        id=row["id"],
        filename=row["filename"],
        text_length=row["text_length"],
        num_chunks=row["num_chunks"],
        status=row["status"],
        created_at=datetime.fromisoformat(row["created_at"]),
        triplets_extracted=row["triplets_extracted"],
        error_message=row["error_message"],
        source_path=row["source_path"],
        raw_text=row["raw_text"],
        language=row["language"],
        used_type_names=json.loads(used_types_raw) if used_types_raw else None,
    )


def _document_to_params(doc: Document) -> tuple:
    return (
        doc.id,
        doc.filename,
        doc.text_length,
        doc.num_chunks,
        doc.status,
        doc.created_at.isoformat(),
        doc.triplets_extracted,
        doc.error_message,
        doc.source_path,
        doc.raw_text,
        doc.language,
        json.dumps(doc.used_type_names) if doc.used_type_names is not None else None,
    )


class SqliteDocumentRepository:

    def __init__(self, db_path: str):
        self._db_path = db_path

    @asynccontextmanager
    async def _connect(self) -> AsyncIterator[aiosqlite.Connection]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            yield db

    async def save(self, doc: Document) -> None:
        async with self._connect() as db:
            await db.execute(
                f"INSERT OR REPLACE INTO documents ({_COLUMNS}) "
                f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                _document_to_params(doc),
            )
            await db.commit()

    async def get(self, doc_id: str) -> Document | None:
        async with self._connect() as db:
            async with db.execute(
                f"SELECT {_COLUMNS} FROM documents WHERE id = ?", (doc_id,)
            ) as cursor:
                row = await cursor.fetchone()
        return _row_to_document(row) if row else None

    async def get_all(self) -> list[Document]:
        async with self._connect() as db:
            async with db.execute(
                f"SELECT {_COLUMNS} FROM documents ORDER BY created_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
        return [_row_to_document(r) for r in rows]

    async def update(self, doc: Document) -> None:
        await self.save(doc)

    async def delete(self, doc_id: str) -> None:
        async with self._connect() as db:
            await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            await db.commit()


class InMemoryDocumentRepository:

    def __init__(self):
        self._store: dict[str, Document] = {}

    async def save(self, doc: Document) -> None:
        self._store[doc.id] = doc

    async def get(self, doc_id: str) -> Document | None:
        return self._store.get(doc_id)

    async def get_all(self) -> list[Document]:
        return sorted(self._store.values(), key=lambda d: d.created_at, reverse=True)

    async def update(self, doc: Document) -> None:
        self._store[doc.id] = doc

    async def delete(self, doc_id: str) -> None:
        self._store.pop(doc_id, None)
