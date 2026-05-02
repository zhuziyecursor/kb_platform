from typing import Optional

from src.config import TikaConfig, MvpLimits
from src.parser import BaseParser, PageInfo, ParseResult


class TikaParser(BaseParser):
    def __init__(self, config: TikaConfig, mvp_limits: MvpLimits):
        self._server_uri = config.server_uri
        self._timeout = config.timeout_seconds
        self._max_pages = mvp_limits.max_file_pages
        self._max_file_size_mb = mvp_limits.max_file_size_mb

    def parse(self, file_bytes: bytes, lang_hints: Optional[list[str]] = None) -> ParseResult:
        from tika import parser as tika_parser

        max_bytes = self._max_file_size_mb * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise ValueError(
                f"File size ({len(file_bytes)} bytes) exceeds MVP limit ({self._max_file_size_mb}MB)"
            )

        headers = {}
        if lang_hints:
            headers["Accept-Language"] = ",".join(lang_hints)

        parsed = tika_parser.from_buffer(
            file_bytes,
            serverEndpoint=self._server_uri,
            requestOptions={"timeout": self._timeout, "headers": headers},
        )

        raw_text = parsed.get("content", "") or ""
        metadata = parsed.get("metadata", {}) or {}

        if not raw_text.strip():
            return ParseResult(
                pages=[PageInfo(page_num=1, text="")],
                metadata=metadata,
            )

        pages_raw = _split_into_pages(raw_text)

        if len(pages_raw) > self._max_pages:
            raise ValueError(
                f"Document has {len(pages_raw)} pages, exceeds MVP limit ({self._max_pages})"
            )

        pages = [
            PageInfo(page_num=i + 1, text=text.strip())
            for i, text in enumerate(pages_raw)
        ]

        return ParseResult(pages=pages, metadata=metadata)


def _split_into_pages(text: str) -> list[str]:
    import re

    separator = re.compile(r'\n\s*\f\s*\n|^\f\s*\n', re.MULTILINE)
    parts = separator.split(text)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts:
        parts = [text]
    return parts
