from __future__ import annotations

import json
import logging
import time

import requests

from src.config import IntelligentChunkerConfig

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "你是文档结构分析专家。你的任务是为给定的段落列表标注语义分片边界。\n"
    "\n"
    "规则：\n"
    "1. 每个段落有一个编号，格式为 [N]\n"
    "2. 你需要在语义边界处切分，将段落分组\n"
    "3. 同一章节/同一主题的段落尽量放在同一组\n"
    '4. 遇到中文标题行（包含"第X章"、"一、"、"1."等），应在此处切分\n'
    "5. 每组总字符数尽量不超过 chunk_size 字符，但不要为了凑字数而强行合并不同主题的段落\n"
    "6. 只返回 JSON，不要包含任何其他文字"
)

USER_PROMPT_TEMPLATE = (
    "请分析以下段落并返回语义分片边界（目标每组不超过 {chunk_size} 字符）：\n"
    "\n"
    "{paragraphs}\n"
    "\n"
    "返回格式：\n"
    '{{"boundaries": [[0,3], [4,7], [8,12]]}}\n'
    "\n"
    "// boundaries 中每个数组 [start, end] 表示将段落 start 到 end 合并为一个 chunk\n"
    "// 边界必须连续且覆盖所有段落，不允许遗漏"
)


class MinimaxClient:
    """MiniMax API HTTP 客户端 — OpenAI 兼容接口"""

    def __init__(self, config: IntelligentChunkerConfig):
        self._url = f"{config.api_base}"
        self._headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        }
        self._model = config.model
        self._temperature = config.temperature
        self._max_tokens = config.max_tokens
        self._timeout = config.timeout_seconds
        self._max_retries = config.max_retries
        self._batch_paragraphs = config.batch_paragraphs
        self._batch_overlap = config.batch_overlap

    def chunk_boundaries(
        self, paragraphs: list[str], chunk_size: int = 1024
    ) -> list[list[int]]:
        """将段落分批调用 LLM 获取语义边界，批间有重叠以避免边界断裂。

        重叠策略：
        - 每批末尾 N 个段落与下一批重叠（N = batch_overlap）
        - 重叠部分以前一批的边界为准
        - 后一批的边界从重叠区之后开始计算
        """
        total = len(paragraphs)
        if total == 0:
            return []

        all_boundaries: list[list[int]] = []
        offset = 0
        effective_batch = self._batch_paragraphs
        overlap = min(self._batch_overlap, effective_batch // 2)

        while offset < total:
            batch_end = min(offset + effective_batch, total)
            # 非最后一批时扩展 overlap 段落
            extended_end = min(batch_end + overlap, total)

            batch = paragraphs[offset:extended_end]
            batch_boundaries = self._call_api(batch, chunk_size)

            # 平移边界到全局索引
            shifted = [[b[0] + offset, b[1] + offset] for b in batch_boundaries]

            if extended_end < total:
                # 只保留非重叠部分的边界
                keep_until = batch_end - 1
                shifted = [b for b in shifted if b[1] <= keep_until]
                if shifted:
                    offset = shifted[-1][1] + 1
                else:
                    offset = batch_end
            else:
                offset = total

            all_boundaries.extend(shifted)

        return all_boundaries

    def _call_api(self, paragraphs: list[str], chunk_size: int) -> list[list[int]]:
        user_prompt = self._build_user_prompt(paragraphs, chunk_size)

        for attempt in range(self._max_retries + 1):
            try:
                payload = {
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": self._temperature,
                    "max_tokens": self._max_tokens,
                }

                resp = requests.post(
                    self._url,
                    headers=self._headers,
                    json=payload,
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                return self._parse_boundaries(data)

            except (requests.Timeout, requests.ConnectionError) as e:
                logger.warning(f"MiniMax API attempt {attempt + 1} failed: {e}")
                if attempt < self._max_retries:
                    time.sleep(1 * (attempt + 1))
                else:
                    raise
            except Exception:
                logger.exception("MiniMax API unexpected error")
                raise

        raise RuntimeError("MiniMax API: unreachable")

    def _build_user_prompt(self, paragraphs: list[str], chunk_size: int) -> str:
        lines = [f"[{i}] {p[:200]}" for i, p in enumerate(paragraphs)]
        return USER_PROMPT_TEMPLATE.format(
            chunk_size=chunk_size,
            paragraphs="\n".join(lines),
        )

    def _parse_boundaries(self, response: dict) -> list[list[int]]:
        content = response["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("\n```", 1)[0]
        parsed = json.loads(content)
        return parsed["boundaries"]
