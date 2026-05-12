from __future__ import annotations

import logging

from src.chunker import BaseChunker, ChunkInfo, ChunkResult, estimate_tokens
from src.chunker.semantic_chunker import SemanticChunker
from src.config import IntelligentChunkerConfig, SmartChunkConfig

logger = logging.getLogger(__name__)


class LLMChunker(BaseChunker):
    """LLM 精修分片器 — 第二层：在 SemanticChunker 基础上调用 MiniMax 精修边界"""

    def __init__(
        self,
        config: IntelligentChunkerConfig,
        chunk_size: int = 1024,
        overlap_ratio: int = 10,
        smart_config: SmartChunkConfig | None = None,
    ):
        self._config = config
        self._chunk_size = chunk_size
        self._overlap_ratio = overlap_ratio
        sc = smart_config or SmartChunkConfig()
        self._semantic = SemanticChunker(
            chunk_size=chunk_size,
            overlap_ratio=overlap_ratio,
            parent_max_size=sc.parent_max_size,
            child_size=sc.child_size,
            child_overlap=sc.child_overlap,
        )
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
        next_seq = 0

        for seq, (start, end) in enumerate(boundaries):
            if start < 0 or end >= len(paragraphs) or start > end:
                continue
            text = '\n\n'.join(paragraphs[start:end + 1])

            parent = ChunkInfo(
                chunk_seq=next_seq,
                text=text,
                char_count=len(text),
                token_count=estimate_tokens(text),
                section_path=None,
                is_parent=True,
            )
            chunks.append(parent)
            parent_seq = next_seq
            next_seq += 1

            # 从 LLM 确定的 Parent 中提取 Child，产生细粒度检索单元
            children = self._semantic._extract_children_from_parent(parent, parent_seq, next_seq)
            for child in children:
                child.chunk_seq = next_seq
                chunks.append(child)
                next_seq += 1

        return ChunkResult(chunks=chunks)


# 延迟导入，避免循环依赖
from src.llm_client import MinimaxClient  # noqa: E402
