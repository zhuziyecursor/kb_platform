"""轻量元数据提取器 — 基于 jieba 的关键词与摘要提取，支持 LLM 增强。

不依赖 torch/transformers 等重型库，纯 Python 实现。
适用于 kb-doc-processor 的文档处理 Pipeline，为每个 chunk 生成：
- keywords: 空格分隔的 Top-N 关键词
- summary:  不超过 max_chars 的单句摘要

LLM 模式：通过 llm-gateway 批量提取，质量更高；不可用时自动降级 jieba。
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import List

import jieba
import jieba.analyse
import requests

logger = logging.getLogger(__name__)

# 审计/合规领域常见低价值词（补充 jieba 内置停用词）
_EXTRA_STOP_WORDS = {
    "公司", "单位", "部门", "人员", "员工", "相关", "有关", "上述", "以下",
    "如下", "规定", "要求", "应当", "必须", "不得", "禁止", "可以",
    "根据", "按照", "依据", "结合", "针对", "关于", "以及", "及其",
    "进行", "开展", "实施", "执行", "落实", "完成", "确保", "保证",
    "情况", "事项", "内容", "部分", "方面", "过程", "结果", "目的",
    "需要", "表示", "认为", "建议", "意见", "说明", "指出", "提出",
    "通过", "经过", "由于", "因此", "因而", "从而", "为此",
    "予以", "给予", "据此", "鉴于此",
}

# LLM 批量提取 Prompt
_BATCH_EXTRACT_SYSTEM = """你是审计/合规文档的元数据标注专家。对每个文本片段执行：
1. 提取 3-5 个关键词（空格分隔，优先提取审计/合规/风控领域术语）
2. 生成一句中文摘要（不超过 200 字，覆盖核心语义）

严格按 JSON 数组格式输出，不含任何额外文字标记：
[{"id":0,"keywords":"...","summary":"..."}, ...]"""


def _resolve_path(path: str) -> str:
    """解析相对路径为绝对路径。支持以项目根目录为基准。"""
    if os.path.isabs(path):
        return path
    cwd_path = Path.cwd() / path
    if cwd_path.exists():
        return str(cwd_path)
    module_dir = Path(__file__).parent
    rel_path = module_dir / path
    if rel_path.exists():
        return str(rel_path)
    return path


class MetadataExtractor:
    """基于 jieba 的轻量元数据提取器，可选 LLM 增强。

    Args:
        keyword_top_n: 提取关键词数量，默认 5
        summary_max_chars: 摘要最大字符数，默认 200
        short_text_threshold: 短文本阈值，低于此长度直接取全文作为摘要
        allow_pos: 允许的词性元组
        custom_dict_path: 自定义词典路径
        llm_enabled: 是否启用 LLM 批量提取
        llm_gateway_url: llm-gateway 地址
        llm_model: LLM 模型名
        llm_batch_size: 每次 LLM 调用处理的 chunk 数
        llm_timeout_seconds: LLM 调用超时秒数
    """

    def __init__(
        self,
        keyword_top_n: int = 5,
        summary_max_chars: int = 200,
        short_text_threshold: int = 100,
        allow_pos: tuple = ("n", "vn", "vd", "nt", "nz", "v", "ns", "nr"),
        custom_dict_path: str = "",
        llm_enabled: bool = False,
        llm_gateway_url: str = "http://localhost:31004/llm/v1/chat/completions",
        llm_model: str = "MiniMax-M2.7",
        llm_batch_size: int = 8,
        llm_timeout_seconds: int = 60,
    ):
        self.keyword_top_n = keyword_top_n
        self.summary_max_chars = summary_max_chars
        self.short_text_threshold = short_text_threshold
        self.allow_pos = allow_pos
        self.llm_enabled = llm_enabled
        self.llm_gateway_url = llm_gateway_url
        self.llm_model = llm_model
        self.llm_batch_size = llm_batch_size
        self.llm_timeout_seconds = llm_timeout_seconds

        if custom_dict_path:
            resolved = _resolve_path(custom_dict_path)
            if Path(resolved).exists():
                try:
                    jieba.load_userdict(resolved)
                    logger.info(f"Loaded custom jieba dict: {resolved}")
                except Exception as e:
                    logger.warning(f"Failed to load custom dict '{resolved}': {e}")
            else:
                logger.warning(f"Custom dict not found: {resolved}")

    # ------------------------------------------------------------------ #
    #  对外批量接口
    # ------------------------------------------------------------------ #

    def extract_batch(self, chunks: list) -> list:
        """批量提取关键词和摘要。

        Args:
            chunks: [{"text": str, "is_parent": bool}, ...]

        Returns:
            [{"keywords": str, "summary": str}, ...] 与输入顺序一致
        """
        if not chunks:
            return []

        if self.llm_enabled:
            try:
                return self._extract_batch_llm(chunks)
            except Exception as e:
                logger.warning(
                    f"LLM metadata extraction failed, falling back to jieba: {e}"
                )

        return self._extract_batch_local(chunks)

    # ------------------------------------------------------------------ #
    #  单条接口（兼容旧调用方，内部走 batch）
    # ------------------------------------------------------------------ #

    def extract_keywords(self, text: str) -> str:
        """提取关键词，空格分隔。"""
        if not text or len(text.strip()) < 4:
            return ""
        results = self.extract_batch([{"text": text, "is_parent": False}])
        return results[0]["keywords"] if results else ""

    def extract_summary(self, text: str, is_parent: bool = False) -> str:
        """提取文本摘要，限制在 max_chars 字符内。"""
        if not text:
            return ""
        results = self.extract_batch([{"text": text, "is_parent": is_parent}])
        return results[0]["summary"] if results else ""

    # ------------------------------------------------------------------ #
    #  LLM 批量提取
    # ------------------------------------------------------------------ #

    def _extract_batch_llm(self, chunks: list) -> list:
        """通过 llm-gateway 批量提取。"""
        all_results: list = []
        for batch_start in range(0, len(chunks), self.llm_batch_size):
            batch = chunks[batch_start : batch_start + self.llm_batch_size]
            results = self._call_llm(batch)
            all_results.extend(results)
        return all_results

    def _call_llm(self, chunks: list) -> list:
        """调用 llm-gateway，解析 JSON 响应。"""
        # 构建请求体
        items = [
            {"id": i, "text": c["text"]}
            for i, c in enumerate(chunks)
        ]
        user_message = json.dumps(items, ensure_ascii=False)

        payload = {
            "model": self.llm_model,
            "messages": [
                {"role": "system", "content": _BATCH_EXTRACT_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.0,
            "maxTokens": 2048,
        }

        resp = requests.post(
            self.llm_gateway_url,
            json=payload,
            timeout=self.llm_timeout_seconds,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        body = resp.json()

        # 解析 OpenAI 兼容响应格式：choice.message.content
        content = body.get("choice", {}).get("message", {}).get("content", "")
        if not content:
            # 尝试 choices 数组格式
            choices = body.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "")

        llm_results = self._parse_json_response(content, len(chunks))
        if llm_results is None:
            raise ValueError(f"Failed to parse LLM response: {content[:200]}")

        # 确保每个结果都有 keywords/summary
        final: list = []
        for i, c in enumerate(chunks):
            if i < len(llm_results):
                final.append({
                    "keywords": str(llm_results[i].get("keywords", "")).strip(),
                    "summary": str(llm_results[i].get("summary", "")).strip()[: self.summary_max_chars],
                })
            else:
                final.append(self._local_single(c["text"], c.get("is_parent", False)))
        return final

    @staticmethod
    def _parse_json_response(content: str, expected_count: int):
        """从 LLM 响应中解析 JSON 数组。容忍 markdown code block 包裹。"""
        # 去掉可能的 markdown ```json ... ``` 包裹
        content = content.strip()
        if content.startswith("```"):
            # 找到第一个换行后到最后一个 ```
            if "\n" in content:
                content = content.split("\n", 1)[1]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # 尝试用正则提取 JSON 数组
            m = re.search(r"\[.*\]", content, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group(0))
                except json.JSONDecodeError:
                    pass
        return None

    # ------------------------------------------------------------------ #
    #  本地 jieba 提取（LLM 不可用时的兜底）
    # ------------------------------------------------------------------ #

    def _extract_batch_local(self, chunks: list) -> list:
        """使用 jieba 逐条提取。"""
        return [
            self._local_single(c["text"], c.get("is_parent", False))
            for c in chunks
        ]

    def _local_single(self, text: str, is_parent: bool = False) -> dict:
        """单条 jieba 提取。"""
        return {
            "keywords": self._extract_keywords_local(text),
            "summary": self._extract_summary_local(text, is_parent),
        }

    def _extract_keywords_local(self, text: str) -> str:
        """jieba TF-IDF 关键词。"""
        if not text or len(text.strip()) < 4:
            return ""

        try:
            keywords = jieba.analyse.extract_tags(
                text,
                topK=self.keyword_top_n * 2,
                withWeight=False,
                allowPOS=self.allow_pos,
            )
            filtered = [
                w for w in keywords
                if w not in _EXTRA_STOP_WORDS and len(w) >= 2
            ]
            return " ".join(filtered[: self.keyword_top_n])
        except Exception as e:
            logger.warning(f"Keyword extraction failed: {e}")
            return ""

    def _extract_summary_local(self, text: str, is_parent: bool = False) -> str:
        """本地摘要提取。"""
        if not text:
            return ""

        text = text.strip()
        if len(text) <= self.short_text_threshold:
            return text[: self.summary_max_chars]

        if is_parent:
            summary = self._textrank_summary(text, top_n=1)
        else:
            summary = self._first_sentence(text)

        return summary[: self.summary_max_chars]

    def _first_sentence(self, text: str) -> str:
        """取首句。"""
        match = re.search(r"[。！？\n]", text)
        if match:
            sent = text[: match.start()].strip()
            return sent if len(sent) > 5 else text[: self.summary_max_chars]
        return text[: self.summary_max_chars]

    def _textrank_summary(self, text: str, top_n: int = 1) -> str:
        """简化版 TextRank：基于句子间词语共现度计算中心句。"""
        sentences = self._split_sentences(text)
        if not sentences:
            return text[: self.summary_max_chars]
        if len(sentences) == 1:
            return sentences[0][: self.summary_max_chars]

        sent_words: List[set] = []
        for s in sentences:
            words = [
                w for w in jieba.lcut(s)
                if len(w.strip()) > 1 and re.match(r"[一-鿿\w]+", w)
            ]
            sent_words.append(set(words))

        n = len(sentences)
        sim_matrix = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                union = sent_words[i] | sent_words[j]
                if not union:
                    continue
                inter = sent_words[i] & sent_words[j]
                sim_matrix[i][j] = len(inter) / len(union)

        scores = [1.0] * n
        damping = 0.85
        for _ in range(30):
            new_scores = []
            for i in range(n):
                s = 0.0
                for j in range(n):
                    if i == j:
                        continue
                    row_sum = sum(sim_matrix[j][k] for k in range(n) if k != j)
                    if row_sum > 0 and sim_matrix[j][i] > 0:
                        s += (sim_matrix[j][i] / row_sum) * scores[j]
                new_scores.append(1 - damping + damping * s)
            scores = new_scores

        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        best_idx = ranked[0][0]
        return sentences[best_idx]

    def _split_sentences(self, text: str) -> List[str]:
        """按中文句子边界分句。"""
        text = text.replace("\n", " ")
        raw = re.split(r"([。！？])", text)
        sentences: List[str] = []
        current = ""
        for part in raw:
            current += part
            if re.match(r"[。！？]", part):
                stripped = current.strip()
                if len(stripped) >= 10:
                    sentences.append(stripped)
                current = ""
        if current.strip() and len(current.strip()) >= 10:
            sentences.append(current.strip())
        return sentences
