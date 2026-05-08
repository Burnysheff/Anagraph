from typing import Protocol, runtime_checkable

from models.document import Document


@runtime_checkable
class DocumentRepository(Protocol):
    def save(self, doc: Document) -> None: ...
    def get(self, doc_id: str) -> Document | None: ...
    def get_all(self) -> list[Document]: ...
    def update(self, doc: Document) -> None: ...
    def delete(self, doc_id: str) -> None: ...


class InMemoryDocumentRepository:

    def __init__(self):
        self._store: dict[str, Document] = {}

    def save(self, doc: Document) -> None:
        self._store[doc.id] = doc

    def get(self, doc_id: str) -> Document | None:
        return self._store.get(doc_id)

    def get_all(self) -> list[Document]:
        return sorted(self._store.values(), key=lambda d: d.created_at, reverse=True)

    def update(self, doc: Document) -> None:
        self._store[doc.id] = doc

    def delete(self, doc_id: str) -> None:
        self._store.pop(doc_id, None)
