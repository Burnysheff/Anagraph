from fastapi import APIRouter, Depends

from api.dependencies import get_llm_client, get_graph_service
from models.qa import QARequest, QAResponse
from services.qa_service import QAService

router = APIRouter()


def get_qa_service(
    llm=Depends(get_llm_client),
    graph=Depends(get_graph_service),
) -> QAService:
    return QAService(llm=llm, graph=graph)


@router.post("", response_model=QAResponse)
async def ask_question(
    request: QARequest,
    qa_service: QAService = Depends(get_qa_service),
):
    return await qa_service.ask(
        question=request.question,
        language=request.language,
    )
