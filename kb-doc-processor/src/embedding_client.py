import logging
import time
from typing import Optional

import requests

from src.config import EmbeddingConfig

logger = logging.getLogger(__name__)


class EmbeddingClient:
    """BGE Embedding 服务 HTTP 客户端。

    调用外部 BGE 模型服务，将文本转换为向量。
    """

    def __init__(self, config: EmbeddingConfig):
        self._url = config.url
        self._timeout = config.timeout_seconds
        self._max_retries = config.max_retries
        self._model_name = config.model_name
        self._dim = config.dim

    @property
    def dim(self) -> int:
        return self._dim

    @property
    def model_name(self) -> str:
        return self._model_name

    def embed(self, texts: list[str]) -> list[list[float]]:
        """对文本列表进行批量向量化。

        Args:
            texts: 文本列表（建议 batch_size=32）

        Returns:
            向量列表，每个向量维度为 dim
        """
        if not texts:
            return []

        last_exception: Optional[Exception] = None
        for attempt in range(self._max_retries):
            try:
                resp = requests.post(
                    self._url,
                    json={"input": texts},
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                data = resp.json()

                raw_data = data.get("data", [])
                if not raw_data:
                    raise ValueError(f"Empty response from embedding service: {data}")

                vectors = [item["embedding"] for item in raw_data]
                return vectors

            except requests.exceptions.RequestException as e:
                last_exception = e
                wait = 2 ** attempt
                logger.warning(
                    f"Embedding request failed (attempt {attempt + 1}/{self._max_retries}): {e}. "
                    f"Retrying in {wait}s..."
                )
                time.sleep(wait)

        raise RuntimeError(
            f"Embedding request failed after {self._max_retries} attempts: {last_exception}"
        )
