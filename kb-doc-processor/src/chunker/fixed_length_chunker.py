from src.chunker import BaseChunker, ChunkInfo, ChunkResult


class FixedLengthChunker(BaseChunker):
    def __init__(self, chunk_size: int = 512, overlap_ratio: int = 10, mode: str = "HEAD_FIRST"):
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
            char_count = len(chunk_text)
            token_count = max(1, int(char_count / 1.5))
            chunks.append(ChunkInfo(
                chunk_seq=i,
                text=chunk_text,
                char_count=char_count,
                token_count=token_count,
            ))

        return ChunkResult(chunks=chunks)

    def _chunk_head_first(self, text: str) -> list[str]:
        chunks = []
        start = 0
        text_len = len(text)
        while start < text_len:
            end = min(start + self._chunk_size, text_len)
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
            chunks.append(text[start:end])
            if start <= 0:
                break
            end -= self._stride
        chunks.reverse()
        return chunks

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
