from __future__ import annotations

import re
import logging
from typing import Optional

from src.chunker import BaseChunker, ChunkInfo, ChunkResult

logger = logging.getLogger(__name__)

_SECTION_PATTERNS = [
    re.compile(r'^第[零一二三四五六七八九十百千\d]+[章节条款]'),
    re.compile(r'^[一二三四五六七八九十]+[、．.]'),
    re.compile(r'^（[一二三四五六七八九十]+）'),
    re.compile(r'^\d+[、．.]\s'),
    re.compile(r'^\d+\.\d+'),
    re.compile(r'^(Chapter|Section|Article)\s+\d+', re.IGNORECASE),
    re.compile(r'^Part\s+\d+', re.IGNORECASE),
    re.compile(r'^(概述|前言|引言|总则|分则|附则|附录)\s*$'),
]


def _is_heading(line: str) -> bool:
    stripped = line.strip()
    if len(stripped) > 60:
        return False
    if len(stripped) == 0:
        return False
    return any(p.match(stripped) for p in _SECTION_PATTERNS)


def _build_section_path(stack: list[str]) -> str | None:
    if not stack:
        return None
    return ' / '.join(stack)


class SemanticChunker(BaseChunker):
    """基于规则的语义分片器 — 第一层：识别章节标题，在语义边界处切分"""

    def __init__(self, chunk_size: int = 1024, overlap_ratio: int = 10):
        if chunk_size < 100 or chunk_size > 2000:
            raise ValueError(f"chunk_size must be in [100, 2000], got {chunk_size}")
        self._chunk_size = chunk_size
        self._overlap = int(chunk_size * overlap_ratio / 100)

    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        paragraphs = self._split_paragraphs(text)
        if len(paragraphs) <= 1:
            return self._fallback_chunk(text)

        sections = self._group_by_headings(paragraphs)
        chunks = self._assemble_chunks(sections)
        return ChunkResult(chunks=chunks)

    def _split_paragraphs(self, text: str) -> list[str]:
        raw = re.split(r'\n\s*\n', text)
        return [p.strip() for p in raw if p.strip()]

    def _group_by_headings(self, paragraphs: list[str]) -> list[dict]:
        sections: list[dict] = []
        current_section: Optional[dict] = None
        heading_stack: list[str] = []

        for para in paragraphs:
            if _is_heading(para):
                if current_section and current_section['paragraphs']:
                    sections.append(current_section)

                heading_text = para.strip()
                heading_stack = self._update_heading_stack(heading_stack, heading_text)
                heading_stack.append(heading_text)
                heading_stack = heading_stack[-5:]

                current_section = {
                    'heading': heading_text,
                    'section_path': _build_section_path(heading_stack),
                    'paragraphs': [heading_text],
                }
            else:
                if current_section is None:
                    current_section = {
                        'heading': None,
                        'section_path': None,
                        'paragraphs': [],
                    }
                current_section['paragraphs'].append(para)

        if current_section and current_section['paragraphs']:
            sections.append(current_section)

        return sections

    @staticmethod
    def _heading_level(heading: str) -> int:
        import re
        if re.match(r'^第[零一二三四五六七八九十百千\d]+[章]', heading):
            return 1
        if re.match(r'^第[零一二三四五六七八九十百千\d]+[节条款]', heading):
            return 2
        if re.match(r'^\d+\.\d+', heading):
            return 4
        if re.match(r'^\d+[、．.]', heading):
            return 3
        if re.match(r'^[一二三四五六七八九十]+[、．.]', heading):
            return 2
        return 5

    def _update_heading_stack(self, stack: list[str], heading: str) -> list[str]:
        level = self._heading_level(heading)
        return [h for h in stack if self._heading_level(h) < level]

    def _assemble_chunks(self, sections: list[dict]) -> list[ChunkInfo]:
        chunks: list[ChunkInfo] = []
        chunk_seq = 0
        carry = ''

        for section in sections:
            full_text = '\n\n'.join(section['paragraphs'])
            if carry:
                full_text = carry + '\n\n' + full_text
                carry = ''

            if len(full_text) <= self._chunk_size:
                chunks.append(ChunkInfo(
                    chunk_seq=chunk_seq,
                    text=full_text,
                    char_count=len(full_text),
                    token_count=max(1, int(len(full_text) / 1.5)),
                    section_path=section['section_path'],
                ))
                chunk_seq += 1
            else:
                sub_chunks = self._split_long_section(
                    section['paragraphs'], section['section_path']
                )
                for sc in sub_chunks:
                    sc.chunk_seq = chunk_seq
                    chunks.append(sc)
                    chunk_seq += 1

        return chunks

    def _split_long_section(
        self, paragraphs: list[str], section_path: str | None
    ) -> list[ChunkInfo]:
        results: list[ChunkInfo] = []
        buf = ''
        buf_len = 0

        for para in paragraphs:
            para_len = len(para)
            if buf_len + para_len + 2 <= self._chunk_size:
                if buf:
                    buf += '\n\n' + para
                    buf_len += 2 + para_len
                else:
                    buf = para
                    buf_len = para_len
            else:
                if buf:
                    results.append(ChunkInfo(
                        chunk_seq=0,
                        text=buf,
                        char_count=buf_len,
                        token_count=max(1, int(buf_len / 1.5)),
                        section_path=section_path,
                    ))
                    buf = para
                    buf_len = para_len
                else:
                    for i in range(0, para_len, self._chunk_size):
                        piece = para[i:i + self._chunk_size]
                        results.append(ChunkInfo(
                            chunk_seq=0,
                            text=piece,
                            char_count=len(piece),
                            token_count=max(1, int(len(piece) / 1.5)),
                            section_path=section_path,
                        ))

        if buf:
            results.append(ChunkInfo(
                chunk_seq=0,
                text=buf,
                char_count=buf_len,
                token_count=max(1, int(buf_len / 1.5)),
                section_path=section_path,
            ))

        return results

    def _fallback_chunk(self, text: str) -> ChunkResult:
        from src.chunker.fixed_length_chunker import FixedLengthChunker
        logger.info("Single paragraph — falling back to FixedLengthChunker")
        fallback = FixedLengthChunker(
            chunk_size=self._chunk_size,
            overlap_ratio=int(self._overlap / self._chunk_size * 100),
        )
        return fallback.chunk(text)
