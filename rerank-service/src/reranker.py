import logging
from typing import List

from sentence_transformers import CrossEncoder

from src.app import get_config

logger = logging.getLogger(__name__)


class Reranker:
    """BGE-Reranker 模型封装，使用 sentence-transformers CrossEncoder。"""

    def __init__(self):
        config = get_config().reranker
        model_path = config.local_model_path or config.model_name
        logger.info("Loading reranker model: %s", model_path)
        self._model = CrossEncoder(
            model_path,
            max_length=config.max_length,
        )
        self._batch_size = config.batch_size
        logger.info("Reranker model loaded successfully")

    def rerank(self, query: str, documents: List[str]) -> List[float]:
        """
        对文档列表进行精排，返回每个文档的相关性分数。

        Args:
            query: 查询文本
            documents: 文档文本列表

        Returns:
            scores: 每个文档的分数（高→更相关），长度与输入一致
        """
        if not documents:
            return []

        pairs = [[query, doc] for doc in documents]
        scores = self._model.predict(
            pairs,
            batch_size=self._batch_size,
            show_progress_bar=False,
        )

        if hasattr(scores, "tolist"):
            scores = scores.tolist()
        return [float(s) for s in scores]


_reranker: Reranker | None = None


def get_reranker() -> Reranker:
    global _reranker
    if _reranker is None:
        _reranker = Reranker()
    return _reranker
