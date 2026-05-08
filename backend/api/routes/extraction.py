import asyncio
import json

from fastapi import APIRouter, Depends
from starlette.responses import StreamingResponse

from api.dependencies import get_extraction_pipeline
from services.extraction_pipeline import ExtractionPipeline

router = APIRouter()


@router.get("/{doc_id}/status")
async def extraction_status(
    doc_id: str,
    pipeline: ExtractionPipeline = Depends(get_extraction_pipeline),
):
    async def event_stream():
        while True:
            job = pipeline.get_job_state(doc_id)
            if not job:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                return

            if job.status in ("processing", "pending"):
                payload = json.dumps({
                    "chunk": job.processed_chunks,
                    "total": job.total_chunks,
                    "triplets_so_far": job.triplets_so_far,
                })
                yield f"event: progress\ndata: {payload}\n\n"

            elif job.status == "completed":
                payload = json.dumps({
                    "total_triplets": job.triplets_so_far,
                    "total_chunks": job.total_chunks,
                })
                yield f"event: complete\ndata: {payload}\n\n"
                return

            elif job.status == "error":
                yield f"event: error\ndata: {json.dumps({'error': job.error})}\n\n"
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
