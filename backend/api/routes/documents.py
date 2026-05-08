import asyncio
import uuid
from datetime import datetime, timezone

import aiofiles
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from pydantic import BaseModel

from api.dependencies import get_doc_repo, get_extraction_pipeline, get_graph_service
from models.document import Document
from services.document_service import DocumentService
from services.document_repository import InMemoryDocumentRepository
from services.extraction_pipeline import ExtractionPipeline
from services.graph_service import GraphService

router = APIRouter()

UPLOAD_DIR = "/app/uploads"


@router.post("", status_code=202)
async def upload_document(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
    pipeline: ExtractionPipeline = Depends(get_extraction_pipeline),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("txt", "pdf", "docx", "doc"):
        raise HTTPException(400, f"Unsupported format: {ext}. Use PDF, DOCX, or TXT.")

    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    file_path = f"{UPLOAD_DIR}/{doc_id}_{file.filename}"

    import os
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    text = DocumentService.extract_text(file_path, file.filename)

    if language == "auto":
        language = _detect_language(text)

    doc = Document(
        id=doc_id,
        filename=file.filename,
        text_length=len(text),
        num_chunks=0,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    doc_repo.save(doc)

    asyncio.create_task(pipeline.run(doc, text, language=language))

    return {"id": doc_id, "filename": file.filename, "status": "processing"}


class TextInput(BaseModel):
    text: str
    language: str = "auto"


@router.post("/text", status_code=202)
async def upload_text(
    body: TextInput,
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
    pipeline: ExtractionPipeline = Depends(get_extraction_pipeline),
):
    if not body.text.strip():
        raise HTTPException(400, "Text is empty")

    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    language = body.language
    if language == "auto":
        language = _detect_language(body.text)

    doc = Document(
        id=doc_id,
        filename="[pasted text]",
        text_length=len(body.text),
        num_chunks=0,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    doc_repo.save(doc)

    asyncio.create_task(pipeline.run(doc, body.text, language=language))

    return {"id": doc_id, "filename": "[pasted text]", "status": "processing"}


@router.get("")
async def list_documents(
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
):
    return doc_repo.get_all()


@router.get("/{doc_id}")
async def get_document(
    doc_id: str,
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
):
    doc = doc_repo.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    doc_repo: InMemoryDocumentRepository = Depends(get_doc_repo),
    graph: GraphService = Depends(get_graph_service),
):
    doc = doc_repo.get(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await graph.delete_by_source(doc_id)
    doc_repo.delete(doc_id)
    return {"status": "deleted"}


def _detect_language(text: str) -> str:
    cyrillic_count = sum(1 for c in text[:1000] if '\u0400' <= c <= '\u04FF')
    return "ru" if cyrillic_count > len(text[:1000]) * 0.2 else "en"
