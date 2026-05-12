"""轻量元数据提取器 — 基于 jieba 的关键词与摘要提取。

不依赖 torch/transformers 等重型库，纯 Python 实现。
适用于 kb-doc-processor 的文档处理 Pipeline，为每个 chunk 生成：
- keywords: 空格分隔的 Top-N 关键词
- summary:  不超过 max_chars 的单句摘要
"""

import logging
import os
import re
from pathlib import Path
from typing import List

import jieba
import jieba.analyse

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


def _resolve_path(path: str) -> str:
    """解析相对路径为绝对路径。支持以项目根目录为基准。"""
    if os.path.isabs(path):
        return path
    # 先尝试相对于当前工作目录
    cwd_path = Path.cwd() / path
    if cwd_path.exists():
        return str(cwd_path)
    # 再尝试相对于本文件所在目录（src/utils/）
    module_dir = Path(__file__).parent
    rel_path = module_dir / path
    if rel_path.exists():
        return str(rel_path)
    return path


class MetadataExtractor:
    """基于 jieba 的轻量元数据提取器。

    Args:
        keyword_top_n: 提取关键词数量，默认 5
        summary_max_chars: 摘要最大字符数，默认 200（Milvus VARCHAR 256 限制留出余量）
        short_text_threshold: 短文本阈值，低于此长度直接取全文作为摘要
        allow_pos: 允许的词性元组，默认保留名词/动词/专有名词类
        custom_dict_path: 自定义词典路径，用于提升审计/合规领域专有名词切分准确率
    """

    def __init__(
        self,
        keyword_top_n: int = 5,
        summary_max_chars: int = 200,
        short_text_threshold: int = 100,
        allow_pos: tuple = ("n", "vn", "vd", "nt", "nz", "v", "ns", "nr"),
        custom_dict_path: str = "",
    ):
        self.keyword_top_n = keyword_top_n
        self.summary_max_chars = summary_max_chars
        self.short_text_threshold = short_text_threshold
        self.allow_pos = allow_pos

        # 加载自定义词典（如有）
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
    #  关键词提取
    # ------------------------------------------------------------------ #

    def extract_keywords(self, text: str) -> str:
        """提取关键词，空格分隔。

        使用 jieba.analyse.extract_tags（基于 TF-IDF，内置通用语料 IDF），
        配合词性过滤，只保留有实际语义价值的词汇。
        """
        if not text or len(text.strip()) < 4:
            return ""

        try:
            keywords = jieba.analyse.extract_tags(
                text,
                topK=self.keyword_top_n * 2,  # 先多取一些，过滤后再截断
                withWeight=False,
                allowPOS=self.allow_pos,
            )
            # 二次过滤：去掉审计/合规领域常见低价值词
            filtered = [
                w for w in keywords
                if w not in _EXTRA_STOP_WORDS and len(w) >= 2
            ]
            return " ".join(filtered[: self.keyword_top_n])
        except Exception as e:
            logger.warning(f"Keyword extraction failed: {e}, fallback to empty")
            return ""

    # ------------------------------------------------------------------ #
    #  摘要提取
    # ------------------------------------------------------------------ #

    def extract_summary(self, text: str, is_parent: bool = False) -> str:
        """提取文本摘要，限制在 max_chars 字符内。

        - Parent chunk (is_parent=True): 段落语义完整，使用 TextRank 提取中心句
        - Children chunk 或短文本: 取首句或全文，避免在滑动窗口切片上做无效计算
        """
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
        """取首句（按句号、问号、感叹号、换行分割）。"""
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

        # 为每个句子分词（过滤单字词和纯标点）
        sent_words: List[set] = []
        for s in sentences:
            words = [
                w for w in jieba.lcut(s)
                if len(w.strip()) > 1 and re.match(r"[\u4e00-\u9fff\w]+", w)
            ]
            sent_words.append(set(words))

        n = len(sentences)
        # 相似度矩阵（Jaccard）
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

        # PageRank 迭代
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
        """按中文句子边界分句，过滤过短句子。"""
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
