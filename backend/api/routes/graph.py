import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from api.dependencies import (
    get_doc_repo,
    get_entity_type_service,
    get_extraction_pipeline,
    get_graph_service,
)
from services.document_repository import DocumentRepository
from services.entity_type_service import EntityTypeService
from services.extraction_pipeline import ExtractionPipeline
from services.graph_service import GraphService

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
    doc_repo: DocumentRepository = Depends(get_doc_repo),
):
    docs = await doc_repo.get_all()
    docs_count = len([d for d in docs if d.status == "completed"])
    return await graph_service.get_stats(documents_processed=docs_count)


@router.delete("/clear")
async def clear_graph(
    graph_service: GraphService = Depends(get_graph_service),
    doc_repo: DocumentRepository = Depends(get_doc_repo),
):
    await graph_service.clear_all()
    docs = await doc_repo.get_all()
    for doc in docs:
        await doc_repo.delete(doc.id)
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


@router.delete("/node/{node_name}")
async def delete_node(
    node_name: str,
    graph_service: GraphService = Depends(get_graph_service),
):
    deleted = await graph_service.delete_node_by_name(node_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"status": "deleted"}


@router.get("/types-snapshot")
async def types_snapshot(
    type_service: EntityTypeService = Depends(get_entity_type_service),
    doc_repo: DocumentRepository = Depends(get_doc_repo),
):
    types = await type_service.get_all()
    current_names = sorted(t.name for t in types)
    docs = await doc_repo.get_all()
    stale_ids: list[str] = []
    for d in docs:
        if d.status != "completed":
            continue
        used = sorted(d.used_type_names or [])
        if used != current_names:
            stale_ids.append(d.id)
    return {
        "is_consistent": len(stale_ids) == 0,
        "stale_doc_ids": stale_ids,
        "current_type_names": current_names,
    }


@router.post("/re-extract", status_code=202)
async def trigger_re_extract(
    pipeline: ExtractionPipeline = Depends(get_extraction_pipeline),
    type_service: EntityTypeService = Depends(get_entity_type_service),
    doc_repo: DocumentRepository = Depends(get_doc_repo),
):
    state = pipeline.get_re_extract_state()
    if state and state.status == "processing":
        raise HTTPException(409, "Re-extraction already in progress")

    docs = await doc_repo.get_all()
    candidates = [d for d in docs if d.raw_text or d.source_path]
    if not candidates:
        raise HTTPException(400, "No documents available for re-extraction")

    entity_types = await type_service.get_all()
    asyncio.create_task(pipeline.re_extract_all(entity_types))

    return {"status": "started", "total_docs": len(candidates)}


@router.get("/re-extract/status")
async def re_extract_status(
    pipeline: ExtractionPipeline = Depends(get_extraction_pipeline),
):
    async def event_stream():
        while True:
            state = pipeline.get_re_extract_state()
            if state is None:
                yield f"event: error\ndata: {json.dumps({'error': 'No re-extraction job'})}\n\n"
                return

            payload = {
                "completed_docs": state.completed_docs,
                "skipped_docs": state.skipped_docs,
                "total_docs": state.total_docs,
                "current_doc_id": state.current_doc_id,
                "current_doc_chunk": state.current_doc_chunk,
                "current_doc_total_chunks": state.current_doc_total_chunks,
                "triplets_so_far": state.triplets_so_far,
            }

            if state.status == "processing":
                yield f"event: progress\ndata: {json.dumps(payload)}\n\n"
            elif state.status == "completed":
                payload["errors"] = state.errors
                yield f"event: complete\ndata: {json.dumps(payload)}\n\n"
                return
            elif state.status == "error":
                yield f"event: error\ndata: {json.dumps({'error': state.error})}\n\n"
                return

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
