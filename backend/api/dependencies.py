from functools import lru_cache

from config import settings
from services.graph_service import GraphService
from services.llm_client import GroqLLMClient
from services.extraction_service import ExtractionService
from services.chunking_service import ChunkingService
from services.normalization_service import NormalizationService
from services.document_repository import InMemoryDocumentRepository
from services.extraction_pipeline import ExtractionPipeline


@lru_cache
def get_graph_service() -> GraphService:
    return GraphService(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password,
    )


@lru_cache
def get_llm_client() -> GroqLLMClient:
    return GroqLLMClient(
        api_key=settings.groq_api_key,
        model=settings.groq_model,
    )


@lru_cache
def get_doc_repo() -> InMemoryDocumentRepository:
    return InMemoryDocumentRepository()


@lru_cache
def get_extraction_pipeline() -> ExtractionPipeline:
    llm = get_llm_client()
    return ExtractionPipeline(
        chunking=ChunkingService(
            chunk_size=settings.chunk_size,
            overlap=settings.chunk_overlap,
        ),
        extraction=ExtractionService(llm),
        normalization=NormalizationService(),
        graph=get_graph_service(),
        doc_repo=get_doc_repo(),
    )
