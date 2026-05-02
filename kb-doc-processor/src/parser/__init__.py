from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PageInfo:
    page_num: int
    text: str
    width: Optional[float] = None
    height: Optional[float] = None


@dataclass
class ParseResult:
    pages: list[PageInfo] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    trace_id: Optional[str] = None

    @property
    def full_text(self) -> str:
        return "\n".join(p.text for p in self.pages)

    @property
    def page_count(self) -> int:
        return len(self.pages)


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_bytes: bytes, lang_hints: Optional[list[str]] = None) -> ParseResult:
        ...
