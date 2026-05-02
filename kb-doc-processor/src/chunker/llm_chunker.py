from __future__ import annotations

import logging

from src.chunker import BaseChunker, ChunkInfo, ChunkResult
from src.chunker.semantic_chunker import SemanticChunker
from src.config import IntelligentChunkerConfig
from src.llm_client import MinimaxClient

logger = logging.getLogger(__name__)


class LLMChunker(BaseChunker):
    """LLM 精修分片器 — 第二层：在 SemanticChunker 基础上调用 MiniMax 精修边界"""

    def __init__(self, config: IntelligentChunkerConfig, chunk_size: int = 1024, overlap_ratio: int = 10):
        self._config = config
        self._chunk_size = chunk_size
        self._overlap_ratio = overlap_ratio
        self._semantic = SemanticChunker(chunk_size=chunk_size, overlap_ratio=overlap_ratio)
        if config.api_key:
            self._client = MinimaxClient(config)
        else:
            self._client = None

    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        paragraphs = self._semantic._split_paragraphs(text)
        if len(paragraphs) <= 1 or self._client is None:
            return self._semantic.chunk(text, metadata)

        try:
            boundaries = self._client.chunk_boundaries(paragraphs, self._chunk_size)
            return self._assemble(paragraphs, boundaries)
        except Exception:
            logger.warning("LLM chunker failed, falling back to SemanticChunker rule result")
            return self._semantic.chunk(text, metadata)

    def _assemble(self, paragraphs: list[str], boundaries: list[list[int]]) -> ChunkResult:
        chunks: list[ChunkInfo] = []
        for seq, (start, end) in enumerate(boundaries):
            if start < 0 or end >= len(paragraphs) or start > end:
                continue
            text = '\n\n'.join(paragraphs[start:end + 1])
            chunks.append(ChunkInfo(
                chunk_seq=seq,
                text=text,
                char_count=len(text),
                token_count=max(1, int(len(text) / 1.5)),
                section_path=None,
            ))
        return ChunkResult(chunks=chunks)
