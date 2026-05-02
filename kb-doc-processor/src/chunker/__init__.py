from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ChunkInfo:
    chunk_seq: int
    text: str
    char_count: int
    token_count: int
    section_path: str | None = None
    page: int | None = None


@dataclass
class ChunkResult:
    chunks: list[ChunkInfo] = field(default_factory=list)
    trace_id: str | None = None

    @property
    def total_chunks(self) -> int:
        return len(self.chunks)


class BaseChunker(ABC):
    @abstractmethod
    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        ...
