from fastapi import APIRouter, Depends, Query

from api.dependencies import get_graph_service, get_doc_repo
from services.graph_service import GraphService
from services.document_repository import InMemoryDocumentRepository

router = APIRouter()


@router.get("")
async def get_graph(
    limit: int = Query(500, ge=1, le=2000),
    types: list[str] | None = Query(None),
    graph_service: GraphService = Depends(get_graph_service),
):
    return await graph_service.get_graph(limit=limit, types_filter=types)


@router.get("/stats")
async def get_stats(
    graph_service: GraphService = Depends(get_graph_service),
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
):
    docs_count = len([d for d in doc_repo.get_all() if d.status == "completed"])
    return await graph_service.get_stats(documents_processed=docs_count)


@router.delete("/clear")
async def clear_graph(
    graph_service: GraphService = Depends(get_graph_service),
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
):
    await graph_service.clear_all()
    for doc in doc_repo.get_all():
        doc_repo.delete(doc.id)
    return {"status": "cleared"}


@router.get("/search")
async def search_nodes(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    graph_service: GraphService = Depends(get_graph_service),
):
    return await graph_service.search_nodes(q, limit=limit)


@router.get("/node/{node_name}/neighbors")
async def get_node_neighbors(
    node_name: str,
    depth: int = Query(1, ge=1, le=3),
    graph_service: GraphService = Depends(get_graph_service),
):
    return await graph_service.get_node_neighborhood(node_name, depth=depth)
