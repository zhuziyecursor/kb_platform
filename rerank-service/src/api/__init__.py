import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.reranker import get_reranker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rerank/v1")


class DocumentInput(BaseModel):
    text: str


class RerankRequest(BaseModel):
    query: str
    documents: list[DocumentInput]


class RerankResult(BaseModel):
    index: int
    score: float


class RerankResponse(BaseModel):
    results: list[RerankResult]
    traceId: str = Field(default_factory=lambda: f"tr-{uuid.uuid4()}")


@router.post("/rerank")
async def rerank(request: RerankRequest):
    trace_id = f"tr-{uuid.uuid4()}"

    if not request.query:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "query is required", "traceId": trace_id},
        )
    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "documents is required", "traceId": trace_id},
        )

    try:
        reranker_instance = get_reranker()
        texts = [doc.text for doc in request.documents]
        scores = reranker_instance.rerank(request.query, texts)

        results = sorted(
            [RerankResult(index=i, score=s) for i, s in enumerate(scores)],
            key=lambda x: x.score,
            reverse=True,
        )[:5]

        return {
            "results": [r.model_dump() for r in results],
            "traceId": trace_id,
        }
    except Exception as e:
        logger.exception("Rerank failed")
        raise HTTPException(
            status_code=500,
            detail={"code": "RERANK_ERROR", "message": str(e), "traceId": trace_id},
        )
