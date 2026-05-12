import re

from src.chunker import BaseChunker, ChunkInfo, ChunkResult, estimate_tokens

# 句子/语义边界模式
_SNAP_PATTERN = re.compile(r'[。！？；\n](?=\s|$)')


class FixedLengthChunker(BaseChunker):
    def __init__(
        self,
        chunk_size: int = 512,
        overlap_ratio: int = 10,
        mode: str = "HEAD_FIRST",
        snap_to_boundary: bool = True,
    ):
        if chunk_size < 100 or chunk_size > 2000:
            raise ValueError(f"chunk_size must be in [100, 2000], got {chunk_size}")
        if overlap_ratio < 0 or overlap_ratio > 50:
            raise ValueError(f"overlap_ratio must be in [0, 50], got {overlap_ratio}")
        if mode not in ("HEAD_FIRST", "TAIL_FIRST", "UNIFORM"):
            raise ValueError(f"chunk_mode must be one of HEAD_FIRST/TAIL_FIRST/UNIFORM, got {mode}")

        self._chunk_size = chunk_size
        self._overlap = int(chunk_size * overlap_ratio / 100)
        self._stride = max(chunk_size - self._overlap, 1)
        self._mode = mode
        self._snap_to_boundary = snap_to_boundary

    @property
    def chunk_size(self) -> int:
        return self._chunk_size

    @property
    def overlap(self) -> int:
        return self._overlap

    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        if self._mode == "HEAD_FIRST":
            chunks_raw = self._chunk_head_first(text)
        elif self._mode == "TAIL_FIRST":
            chunks_raw = self._chunk_tail_first(text)
        else:
            chunks_raw = self._chunk_uniform(text)

        chunks = []
        for i, chunk_text in enumerate(chunks_raw):
            chunks.append(ChunkInfo(
                chunk_seq=i,
                text=chunk_text,
                char_count=len(chunk_text),
                token_count=estimate_tokens(chunk_text),
            ))

        return ChunkResult(chunks=chunks)

    def _chunk_head_first(self, text: str) -> list[str]:
        chunks = []
        start = 0
        text_len = len(text)
        while start < text_len:
            end = min(start + self._chunk_size, text_len)
            if self._snap_to_boundary and end < text_len:
                end = self._snap(text, end)
            chunks.append(text[start:end])
            if end >= text_len:
                break
            start += self._stride
        return chunks

    def _chunk_tail_first(self, text: str) -> list[str]:
        chunks = []
        text_len = len(text)
        end = text_len
        while end > 0:
            start = max(end - self._chunk_size, 0)
            if self._snap_to_boundary and start > 0:
                start = self._snap(text, start)
            chunks.append(text[start:end])
            if start <= 0:
                break
            end -= self._stride
        chunks.reverse()
        return chunks

    @staticmethod
    def _snap(text: str, pos: int) -> int:
        """回退到最近的句子/语义边界（句号、换行等）。

        在 pos 前后各搜 20% chunk_size 范围内找边界点。
        找不到则返回原始位置。
        """
        search_window = max(100, int(pos * 0.2))
        search_start = max(0, pos - search_window)
        search_end = min(len(text), pos + search_window)
        search_text = text[search_start:search_end]

        best = pos
        for m in _SNAP_PATTERN.finditer(search_text):
            boundary = search_start + m.end()
            if boundary <= pos and (pos - boundary) < (pos - best):
                best = boundary
            elif boundary > pos and (pos - best) > (boundary - pos):
                best = boundary
                break

        return best

    def _chunk_uniform(self, text: str) -> list[str]:
        text_len = len(text)
        if text_len <= self._chunk_size:
            return [text]

        total_chunks = max(1, (text_len + self._stride - 1) // self._stride)
        total_len_needed = total_chunks * self._chunk_size - (total_chunks - 1) * self._overlap
        if total_len_needed <= text_len:
            return self._chunk_head_first(text)

        chunk_len = text_len // total_chunks
        remainder = text_len % total_chunks
        chunks = []
        pos = 0
        for i in range(total_chunks):
            extra = 1 if i < remainder else 0
            end = pos + chunk_len + extra
            chunks.append(text[pos:end])
            pos = end
        return chunks
