from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class CleanResult:
    cleaned_text: str
    quality_score: float  # 0-100
    issues: list[str] = field(default_factory=list)
    trace_id: str | None = None


class BaseCleaner(ABC):
    @abstractmethod
    def clean(self, text: str, metadata: dict | None = None) -> CleanResult:
        ...
