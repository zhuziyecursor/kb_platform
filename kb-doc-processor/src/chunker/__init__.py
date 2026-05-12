from __future__ import annotations

import re
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
    parent_ref: str | None = None  # 格式: "doc_id/version/parent_seq"，无 Parent 时为 None
    is_parent: bool = False       # 是否为 Parent chunk
    summary: str = ""             # chunk 级单句摘要（由 MetadataExtractor 生成）


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


def estimate_tokens(text: str) -> int:
    """估算文本的 token 数量，自适应中英文混合。

    中文: ~0.5 tokens/字 (常见中文 embedding 模型约 1.5-2 字/token)
    英文: ~1.3 tokens/词
    混合文本按中文字符占比加权。
    """
    if not text:
        return 0

    char_count = len(text)
    cjk_pattern = re.compile(r'[一-鿿㐀-䶿豈-﫿]')
    cjk_chars = len(cjk_pattern.findall(text))
    cjk_ratio = cjk_chars / char_count if char_count > 0 else 0

    # 英文字符数 = 总字符 - CJK字符
    non_cjk_chars = char_count - cjk_chars
    # 粗略估算英文单词数
    english_words = max(1, non_cjk_chars / 5) if non_cjk_chars > 0 else 0

    # 中文 token 估算 + 英文 token 估算
    cn_tokens = cjk_chars * 0.5
    en_tokens = english_words * 1.3

    return max(1, int(cn_tokens + en_tokens))
