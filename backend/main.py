from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.dependencies import get_entity_type_service, get_graph_service
from api.routes import documents, entity_types, graph, qa, extraction
from services.storage import init_database
from settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_database(settings.database_path)
    await get_entity_type_service().ensure_initialized()
    graph_service = get_graph_service()
    await graph_service.create_indexes()
    yield
    await graph_service.close()


app = FastAPI(
    title="Anagraph API",
    description="Knowledge Graph Builder from unstructured text",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
app.include_router(qa.router, prefix="/api/qa", tags=["qa"])
app.include_router(extraction.router, prefix="/api/extraction", tags=["extraction"])
app.include_router(entity_types.router, prefix="/api/entity-types", tags=["entity-types"])

_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
