"""测试 MetadataExtractor 的关键词与摘要提取。"""

import json
from pathlib import Path
from unittest import mock

import pytest
import requests

from src.utils.metadata_extractor import MetadataExtractor


class TestMetadataExtractor:
    @pytest.fixture
    def extractor(self):
        return MetadataExtractor(keyword_top_n=5, summary_max_chars=200)

    @pytest.fixture
    def extractor_with_dict(self):
        dict_path = Path(__file__).parent.parent / "src" / "utils" / "custom_dict.txt"
        return MetadataExtractor(
            keyword_top_n=5,
            summary_max_chars=200,
            custom_dict_path=str(dict_path),
        )

    @pytest.fixture
    def llm_extractor(self):
        """启用 LLM 的提取器。"""
        return MetadataExtractor(
            keyword_top_n=5,
            summary_max_chars=200,
            llm_enabled=True,
            llm_gateway_url="http://localhost:31004/llm/v1/chat/completions",
            llm_model="MiniMax-M2.7",
            llm_batch_size=2,
            llm_timeout_seconds=10,
        )

    @pytest.fixture
    def sample_chunks(self):
        return [
            {
                "text": "内部审计是独立、客观的确认和咨询活动，旨在增加价值和改善组织运营。它通过系统、规范的方法，评价并改善风险管理、控制和治理过程的效果。",
                "is_parent": True,
            },
            {
                "text": "风险评估是识别和分析相关风险以实现目标的过程，包括风险识别、风险分析和风险评价三个步骤。",
                "is_parent": False,
            },
            {
                "text": "控制测试是审计人员为了确定内部控制运行的有效性而实施的审计程序，包括询问、观察、检查和重新执行。",
                "is_parent": False,
            },
        ]

    # ------------------------------------------------------------------ #
    #  关键词提取（jieba local）
    # ------------------------------------------------------------------ #

    def test_extract_keywords_empty(self, extractor):
        assert extractor.extract_keywords("") == ""
        assert extractor.extract_keywords("   ") == ""
        assert extractor.extract_keywords("ab") == ""

    def test_extract_keywords_basic(self, extractor):
        text = "内部审计是独立、客观的确认和咨询活动，旨在增加价值和改善组织运营。"
        result = extractor.extract_keywords(text)
        assert result != ""
        keywords = result.split()
        assert len(keywords) <= 5
        assert any("审计" in k for k in keywords)

    def test_extract_keywords_filters_stopwords(self, extractor):
        text = "公司进行内部审计，审计部门应当按照规定要求开展工作。"
        result = extractor.extract_keywords(text)
        keywords = result.split()
        assert "公司" not in keywords
        assert "部门" not in keywords
        assert "应当" not in keywords

    def test_extract_keywords_pos_filter(self, extractor):
        text = "风险评估是内部审计的重要组成部分，审计人员通过风险导向方法开展审计工作。"
        result = extractor.extract_keywords(text)
        keywords = result.split()
        assert any("审计" in k for k in keywords)
        assert any("风险" in k for k in keywords)

    def test_custom_dict_improves_segmentation(self, extractor_with_dict):
        text = "实质性程序和控制测试是审计中常用的方法，穿行测试用于评价内部控制。"
        result = extractor_with_dict.extract_keywords(text)
        keywords = result.split()
        assert any("实质性程序" == k for k in keywords) or any("控制测试" == k for k in keywords)

    # ------------------------------------------------------------------ #
    #  摘要提取（jieba local）
    # ------------------------------------------------------------------ #

    def test_extract_summary_empty(self, extractor):
        assert extractor.extract_summary("") == ""

    def test_extract_summary_short_text(self, extractor):
        text = "内部审计是独立、客观的确认活动。"
        result = extractor.extract_summary(text, is_parent=True)
        assert result == text

    def test_extract_summary_parent_chunk(self, extractor):
        text = (
            "内部审计是一种独立、客观的确认和咨询活动，旨在增加价值和改善组织的运营。"
            "它通过系统、规范的方法，评价并改善风险管理、控制和治理过程的效果。"
            "内部审计帮助组织实现其目标，是现代公司治理的重要组成部分。"
            "审计人员应当保持独立性和客观性，确保审计结论的可靠性。"
        )
        result = extractor.extract_summary(text, is_parent=True)
        assert result != ""
        assert len(result) <= 200
        assert len(result) >= 10

    def test_extract_summary_children_chunk(self, extractor):
        text = (
            "风险评估是识别和分析相关风险以实现目标的过程。"
            "它包括风险识别、风险分析和风险评价三个步骤。"
            "组织应当建立系统的风险评估机制，确保及时发现潜在风险。"
        )
        result = extractor.extract_summary(text, is_parent=False)
        assert "风险评估" in result
        assert len(result) <= 200

    def test_extract_summary_truncate(self, extractor):
        long_text = "这是一段测试文本。" * 100
        result = extractor.extract_summary(long_text, is_parent=False)
        assert len(result) <= 200

    # ------------------------------------------------------------------ #
    #  配置化测试
    # ------------------------------------------------------------------ #

    def test_configurable_top_n(self):
        extractor = MetadataExtractor(keyword_top_n=3)
        text = (
            "内部审计、风险评估、控制测试、实质性程序、穿行测试、数据分析、"
            "合规管理、公司治理、信息披露、关联交易"
        )
        result = extractor.extract_keywords(text)
        keywords = result.split()
        assert len(keywords) <= 3

    def test_configurable_summary_max_chars(self):
        extractor = MetadataExtractor(summary_max_chars=50)
        text = "这是一段非常长的测试文本，用来验证摘要长度限制是否生效。" * 10
        result = extractor.extract_summary(text, is_parent=True)
        assert len(result) <= 50

    def test_configurable_short_text_threshold(self):
        extractor = MetadataExtractor(short_text_threshold=20)
        text = "短文本测试。"
        result = extractor.extract_summary(text, is_parent=True)
        assert result == text

    def test_custom_dict_path_resolution(self):
        abs_path = Path(__file__).parent.parent / "src" / "utils" / "custom_dict.txt"
        ext = MetadataExtractor(custom_dict_path=str(abs_path))
        assert ext is not None

        rel_path = "src/utils/custom_dict.txt"
        ext2 = MetadataExtractor(custom_dict_path=rel_path)
        assert ext2 is not None

        ext3 = MetadataExtractor(custom_dict_path="/nonexistent/dict.txt")
        assert ext3 is not None

    # ------------------------------------------------------------------ #
    #  批量本地提取
    # ------------------------------------------------------------------ #

    def test_extract_batch_local(self, extractor, sample_chunks):
        results = extractor.extract_batch(sample_chunks)
        assert len(results) == 3
        for r in results:
            assert "keywords" in r
            assert "summary" in r
            assert isinstance(r["keywords"], str)
            assert isinstance(r["summary"], str)
        # Parent chunk should have a meaningful summary
        assert len(results[0]["summary"]) > 0
        # Keywords should be space-separated
        assert " " in results[0]["keywords"] or results[0]["keywords"] == ""

    def test_extract_batch_empty(self, extractor):
        assert extractor.extract_batch([]) == []

    # ------------------------------------------------------------------ #
    #  LLM 批量提取（mock）
    # ------------------------------------------------------------------ #

    def test_extract_batch_llm_success(self, sample_chunks):
        """LLM 批量提取成功返回。batch_size=10 确保 3 个 chunk 在一次调用中完成。"""
        llm_extractor = MetadataExtractor(
            keyword_top_n=5, summary_max_chars=200,
            llm_enabled=True, llm_batch_size=10, llm_timeout_seconds=10,
        )
        mock_response = {
            "choice": {
                "message": {
                    "content": json.dumps([
                        {"id": 0, "keywords": "内部审计 风险管理 治理", "summary": "内部审计通过系统方法评价并改善组织运营和治理。"},
                        {"id": 1, "keywords": "风险评估 风险识别 风险分析", "summary": "风险评估包括风险识别、风险分析和风险评价三个步骤。"},
                        {"id": 2, "keywords": "控制测试 内部控制 审计程序", "summary": "控制测试用于确定内部控制运行的有效性。"},
                    ], ensure_ascii=False),
                }
            }
        }
        with mock.patch("src.utils.metadata_extractor.requests.post") as mock_post:
            mock_post.return_value.json.return_value = mock_response
            mock_post.return_value.raise_for_status = lambda: None

            results = llm_extractor.extract_batch(sample_chunks)

        assert len(results) == 3
        assert results[0]["keywords"] == "内部审计 风险管理 治理"
        assert results[0]["summary"] == "内部审计通过系统方法评价并改善组织运营和治理。"
        assert results[1]["keywords"] == "风险评估 风险识别 风险分析"
        assert results[2]["keywords"] == "控制测试 内部控制 审计程序"

    def test_extract_batch_llm_fallback_on_error(self, llm_extractor, sample_chunks):
        """LLM 调用失败时应降级到 jieba 本地提取。"""
        with mock.patch("src.utils.metadata_extractor.requests.post") as mock_post:
            mock_post.side_effect = requests.Timeout("Connection timed out")

            results = llm_extractor.extract_batch(sample_chunks)

        assert len(results) == 3
        for r in results:
            assert "keywords" in r
            assert "summary" in r
        # 降级后关键词应包含核心术语
        assert any("审计" in results[0]["keywords"] or "风险" in results[0]["keywords"]
                   for r in [results[0]])

    def test_extract_batch_llm_fallback_on_bad_json(self, llm_extractor, sample_chunks):
        """LLM 返回无法解析的 JSON 时应降级。"""
        mock_response = {
            "choice": {
                "message": {
                    "content": "sorry I can't do that, here's some random text instead",
                }
            }
        }
        with mock.patch("src.utils.metadata_extractor.requests.post") as mock_post:
            mock_post.return_value.json.return_value = mock_response
            mock_post.return_value.raise_for_status = lambda: None

            results = llm_extractor.extract_batch(sample_chunks)

        assert len(results) == 3
        for r in results:
            assert "keywords" in r
            assert "summary" in r

    def test_llm_disabled_uses_local(self, extractor, sample_chunks):
        """llm_enabled=False 时直接走本地提取，不发 HTTP 请求。"""
        with mock.patch("src.utils.metadata_extractor.requests.post") as mock_post:
            results = extractor.extract_batch(sample_chunks)

        mock_post.assert_not_called()
        assert len(results) == 3
        for r in results:
            assert "keywords" in r
            assert "summary" in r

    # ------------------------------------------------------------------ #
    #  LLM 响应解析
    # ------------------------------------------------------------------ #

    def test_parse_json_response_normal(self, extractor):
        content = json.dumps([
            {"id": 0, "keywords": "a b", "summary": "text 1"},
            {"id": 1, "keywords": "c d", "summary": "text 2"},
        ])
        result = extractor._parse_json_response(content, 2)
        assert result is not None
        assert len(result) == 2
        assert result[0]["keywords"] == "a b"

    def test_parse_json_response_markdown_wrapped(self, extractor):
        content = '```json\n[{"id":0,"keywords":"a b","summary":"text"}]\n```'
        result = extractor._parse_json_response(content, 1)
        assert result is not None
        assert result[0]["summary"] == "text"

    def test_parse_json_response_invalid(self, extractor):
        result = extractor._parse_json_response("not json at all", 1)
        assert result is None

    def test_parse_json_response_partial_invalid_with_regex(self, extractor):
        """响应中混有非 JSON 文本，但包含有效 JSON 数组。"""
        content = 'Here is the result:\n[{"id":0,"keywords":"internal audit","summary":"Audit summary."}]\nLet me know if you need more.'
        result = extractor._parse_json_response(content, 1)
        assert result is not None
        assert result[0]["keywords"] == "internal audit"

    # ------------------------------------------------------------------ #
    #  端到端
    # ------------------------------------------------------------------ #

    def test_end_to_end_audit_text(self, extractor):
        text = (
            "控制测试是审计人员为了确定内部控制运行的有效性而实施的审计程序。"
            "它包括询问、观察、检查和重新执行等程序。"
            "审计人员应当根据风险评估结果，设计并实施适当的控制测试。"
            "控制测试的范围和性质取决于所评估的控制风险水平。"
            "如果控制测试表明内部控制运行有效，审计人员可以减少实质性程序的范围。"
        )
        keywords = extractor.extract_keywords(text)
        summary = extractor.extract_summary(text, is_parent=True)

        assert keywords != ""
        assert summary != ""
        assert len(summary) <= 200
        assert "控制测试" in keywords or "审计" in keywords or "程序" in keywords
