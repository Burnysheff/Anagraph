from dataclasses import dataclass, field

from models.document import Document
from models.entity_type import EntityType
from services.chunking_service import ChunkingService
from services.document_service import DocumentService
from services.extraction_service import ExtractionService
from services.normalization_service import NormalizationService
from services.graph_service import GraphService
from services.document_repository import DocumentRepository


@dataclass
class ExtractionJobState:
    doc_id: str
    total_chunks: int = 0
    processed_chunks: int = 0
    triplets_so_far: int = 0
    status: str = "pending"  # pending | processing | completed | error
    error: str | None = None


@dataclass
class ReExtractJobState:
    total_docs: int = 0
    completed_docs: int = 0
    skipped_docs: int = 0
    current_doc_id: str | None = None
    current_doc_chunk: int = 0
    current_doc_total_chunks: int = 0
    triplets_so_far: int = 0
    status: str = "pending"  # pending | processing | completed | error
    error: str | None = None
    errors: list[str] = field(default_factory=list)


class ExtractionPipeline:

    def __init__(
        self,
        chunking: ChunkingService,
        extraction: ExtractionService,
        normalization: NormalizationService,
        graph: GraphService,
        doc_repo: DocumentRepository,
    ):
        self.chunking = chunking
        self.extraction = extraction
        self.normalization = normalization
        self.graph = graph
        self.doc_repo = doc_repo
        self.jobs: dict[str, ExtractionJobState] = {}
        self.re_extract_job: ReExtractJobState | None = None

    async def run(
        self,
        doc: Document,
        text: str,
        language: str = "ru",
        entity_types: list[EntityType] | None = None,
    ):
        job = ExtractionJobState(doc_id=doc.id)
        self.jobs[doc.id] = job

        try:
            chunks = self.chunking.split(text)
            job.total_chunks = len(chunks)
            job.status = "processing"

            doc_updated = doc.model_copy(update={
                "status": "processing",
                "num_chunks": len(chunks),
            })
            await self.doc_repo.update(doc_updated)

            total_triplets = 0

            for chunk in chunks:
                result = await self.extraction.extract_from_chunk(
                    chunk_text=chunk.text,
                    chunk_index=chunk.index,
                    total_chunks=len(chunks),
                    language=language,
                    entity_types=entity_types,
                )

                added = 0
                if result.triplets:
                    normalized = self.normalization.normalize_triplets(result.triplets)
                    await self.graph.save_triplets(normalized, source_id=doc.id)
                    added = len(normalized)
                    total_triplets += added

                job.processed_chunks = chunk.index + 1
                job.triplets_so_far = total_triplets

                if self.re_extract_job is not None:
                    self.re_extract_job.current_doc_chunk = job.processed_chunks
                    self.re_extract_job.current_doc_total_chunks = job.total_chunks
                    self.re_extract_job.triplets_so_far += added

            job.status = "completed"
            doc_final = doc.model_copy(update={
                "status": "completed",
                "triplets_extracted": total_triplets,
                "num_chunks": len(chunks),
            })
            await self.doc_repo.update(doc_final)

        except Exception as e:
            job.status = "error"
            job.error = str(e)
            doc_err = doc.model_copy(update={
                "status": "error",
                "error_message": str(e),
            })
            await self.doc_repo.update(doc_err)

    def get_job_state(self, doc_id: str) -> ExtractionJobState | None:
        return self.jobs.get(doc_id)

    def get_re_extract_state(self) -> ReExtractJobState | None:
        return self.re_extract_job

    async def re_extract_all(self, entity_types: list[EntityType]) -> None:
        state = ReExtractJobState(status="processing")
        self.re_extract_job = state
        type_names = [t.name for t in entity_types]

        try:
            all_docs = await self.doc_repo.get_all()
            candidates = [d for d in all_docs if d.raw_text or d.source_path]
            state.total_docs = len(candidates)

            await self.graph.clear_all()

            for doc in candidates:
                state.current_doc_id = doc.id
                state.current_doc_chunk = 0
                state.current_doc_total_chunks = 0

                text = await self._load_text(doc)
                if text is None:
                    state.skipped_docs += 1
                    state.errors.append(f"{doc.id}: source unavailable")
                    continue

                refreshed = doc.model_copy(update={
                    "status": "pending",
                    "triplets_extracted": 0,
                    "error_message": None,
                    "used_type_names": type_names,
                })
                await self.doc_repo.update(refreshed)

                await self.run(
                    refreshed,
                    text,
                    language=refreshed.language or "ru",
                    entity_types=entity_types,
                )

                state.completed_docs += 1

            state.current_doc_id = None
            state.status = "completed"

        except Exception as e:
            state.status = "error"
            state.error = str(e)

    async def _load_text(self, doc: Document) -> str | None:
        if doc.raw_text:
            return doc.raw_text
        if doc.source_path:
            try:
                return DocumentService.extract_text(doc.source_path, doc.filename)
            except (OSError, ValueError):
                return None
        return None
