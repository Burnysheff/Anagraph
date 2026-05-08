import asyncio
from dataclasses import dataclass, field

from models.document import Document
from services.chunking_service import ChunkingService
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

    async def run(
        self,
        doc: Document,
        text: str,
        language: str = "ru",
        entity_types: list[str] | None = None,
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
            self.doc_repo.update(doc_updated)

            total_triplets = 0

            for chunk in chunks:
                result = await self.extraction.extract_from_chunk(
                    chunk_text=chunk.text,
                    chunk_index=chunk.index,
                    total_chunks=len(chunks),
                    language=language,
                    entity_types=entity_types,
                )

                if result.triplets:
                    normalized = self.normalization.normalize_triplets(result.triplets)
                    await self.graph.save_triplets(normalized, source_id=doc.id)
                    total_triplets += len(normalized)

                job.processed_chunks = chunk.index + 1
                job.triplets_so_far = total_triplets

            job.status = "completed"
            doc_final = doc.model_copy(update={
                "status": "completed",
                "triplets_extracted": total_triplets,
                "num_chunks": len(chunks),
            })
            self.doc_repo.update(doc_final)

        except Exception as e:
            job.status = "error"
            job.error = str(e)
            doc_err = doc.model_copy(update={
                "status": "error",
                "error_message": str(e),
            })
            self.doc_repo.update(doc_err)

    def get_job_state(self, doc_id: str) -> ExtractionJobState | None:
        return self.jobs.get(doc_id)
