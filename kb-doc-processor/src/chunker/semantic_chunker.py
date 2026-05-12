from __future__ import annotations

import re
import logging
from typing import Optional

from src.chunker import BaseChunker, ChunkInfo, ChunkResult, estimate_tokens

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
    """基于规则的语义分片器 — 支持 Parent-Children 双层架构

    分块策略：
    1. 识别章节/条款标题，将标题 + 后跟段落划为一个语义单元（Parent）
    2. 从 Parent 内部按滑动窗口切出 Child，用于向量检索
    3. Parent 存储完整上下文，用于生成
    """

    def __init__(
        self,
        chunk_size: int = 1024,
        overlap_ratio: int = 10,
        parent_max_size: int = 1500,
        child_size: int = 400,
        child_overlap: int = 50,
    ):
        if chunk_size < 100 or chunk_size > 2000:
            raise ValueError(f"chunk_size must be in [100, 2000], got {chunk_size}")
        self._chunk_size = chunk_size
        self._overlap = int(chunk_size * overlap_ratio / 100)
        self._parent_max_size = parent_max_size
        self._child_size = child_size
        self._child_overlap = child_overlap

    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        paragraphs = self._split_paragraphs(text)
        if len(paragraphs) <= 1:
            return self._fallback_chunk(text)

        sections = self._group_by_headings(paragraphs)
        chunks = self._assemble_parent_children(sections)
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

    def _assemble_parent_children(self, sections: list[dict]) -> list[ChunkInfo]:
        """生成 Parent-Children 双层 chunks

        1. 每个 section 是一个 Parent（含标题 + 段落）
        2. 从 Parent 内部按滑动窗口切出 Children
        3. Parent 和 Children 通过 parent_ref 关联
        """
        chunks: list[ChunkInfo] = []
        next_seq = 0

        for section in sections:
            section_text = '\n\n'.join(section['paragraphs'])

            # Parent 超过限制时按段落拆分
            if len(section_text) > self._parent_max_size:
                sub_parents = self._split_long_section(section['paragraphs'], section['section_path'], next_seq)
                for sp in sub_parents:
                    sp.chunk_seq = next_seq
                    chunks.append(sp)
                    parent_seq = next_seq
                    next_seq += 1
                    children = self._extract_children_from_parent(sp, parent_seq, next_seq)
                    chunks.extend(children)
                    next_seq += len(children)
            else:
                parent_chunk = ChunkInfo(
                    chunk_seq=next_seq,
                    text=section_text,
                    char_count=len(section_text),
                    token_count=estimate_tokens(section_text),
                    section_path=section['section_path'],
                    is_parent=True,
                )
                chunks.append(parent_chunk)
                parent_seq = next_seq
                next_seq += 1
                children = self._extract_children_from_parent(parent_chunk, parent_seq, next_seq)
                chunks.extend(children)
                next_seq += len(children)

        return chunks

    def _extract_children_from_parent(self, parent: ChunkInfo, parent_seq: int, start_child_seq: int) -> list[ChunkInfo]:
        """从 Parent chunk 按滑动窗口切出 Children"""
        text = parent.text

        children: list[ChunkInfo] = []
        stride = self._child_size - self._child_overlap
        if stride <= 0:
            stride = self._child_size

        offset = 0
        child_seq = start_child_seq
        while offset < len(text):
            end = min(offset + self._child_size, len(text))
            child_text = text[offset:end]
            if len(child_text.strip()) < 50:  # 太短的片段跳过
                offset += stride
                continue

            child = ChunkInfo(
                chunk_seq=child_seq,
                text=child_text,
                char_count=len(child_text),
                token_count=estimate_tokens(child_text),
                section_path=parent.section_path,
                is_parent=False,
            )
            children.append(child)
            child_seq += 1
            offset += stride

        return children

    def _split_long_section(
        self, paragraphs: list[str], section_path: str | None, parent_seq: int
    ) -> list[ChunkInfo]:
        """超长 section 按段落边界拆分为多个子 Parent"""
        results: list[ChunkInfo] = []
        buf = ''
        buf_len = 0
        seq = parent_seq

        for para in paragraphs:
            para_len = len(para)
            if buf_len + para_len + 2 <= self._parent_max_size:
                if buf:
                    buf += '\n\n' + para
                    buf_len += 2 + para_len
                else:
                    buf = para
                    buf_len = para_len
            else:
                if buf:
                    results.append(ChunkInfo(
                        chunk_seq=seq,
                        text=buf,
                        char_count=buf_len,
                        token_count=estimate_tokens(buf),
                        section_path=section_path,
                        is_parent=True,
                    ))
                    seq += 1
                    buf = para
                    buf_len = para_len
                else:
                    # 单段落就超过限制，按固定长度切
                    for i in range(0, para_len, self._parent_max_size):
                        piece = para[i:i + self._parent_max_size]
                        results.append(ChunkInfo(
                            chunk_seq=seq,
                            text=piece,
                            char_count=len(piece),
                            token_count=estimate_tokens(piece),
                            section_path=section_path,
                            is_parent=True,
                        ))
                        seq += 1

        if buf:
            results.append(ChunkInfo(
                chunk_seq=seq,
                text=buf,
                char_count=buf_len,
                token_count=estimate_tokens(buf),
                section_path=section_path,
                is_parent=True,
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
