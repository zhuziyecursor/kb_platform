"""测试 MetadataExtractor 的关键词与摘要提取。"""

import os
from pathlib import Path

import pytest

from src.utils.metadata_extractor import MetadataExtractor


class TestMetadataExtractor:
    @pytest.fixture
    def extractor(self):
        return MetadataExtractor(keyword_top_n=5, summary_max_chars=200)

    @pytest.fixture
    def extractor_with_dict(self):
        """加载自定义词典的提取器。"""
        dict_path = Path(__file__).parent.parent / "src" / "utils" / "custom_dict.txt"
        return MetadataExtractor(
            keyword_top_n=5,
            summary_max_chars=200,
            custom_dict_path=str(dict_path),
        )

    # ------------------------------------------------------------------ #
    #  关键词提取
    # ------------------------------------------------------------------ #

    def test_extract_keywords_empty(self, extractor):
        assert extractor.extract_keywords("") == ""
        assert extractor.extract_keywords("   ") == ""
        assert extractor.extract_keywords("ab") == ""

    def test_extract_keywords_basic(self, extractor):
        text = "内部审计是独立、客观的确认和咨询活动，旨在增加价值和改善组织运营。"
        result = extractor.extract_keywords(text)
        assert result != ""
        # 关键词应为空格分隔
        keywords = result.split()
        assert len(keywords) <= 5
        # 应包含核心语义词
        assert any("审计" in k for k in keywords)

    def test_extract_keywords_filters_stopwords(self, extractor):
        text = "公司进行内部审计，审计部门应当按照规定要求开展工作。"
        result = extractor.extract_keywords(text)
        keywords = result.split()
        # 低价值词（公司、部门、应当、规定、要求）应被过滤
        assert "公司" not in keywords
        assert "部门" not in keywords
        assert "应当" not in keywords

    def test_extract_keywords_pos_filter(self, extractor):
        text = "风险评估是内部审计的重要组成部分，审计人员通过风险导向方法开展审计工作。"
        result = extractor.extract_keywords(text)
        keywords = result.split()
        # 应保留名词性词汇
        assert any("审计" in k for k in keywords)
        assert any("风险" in k for k in keywords)

    def test_custom_dict_improves_segmentation(self, extractor_with_dict):
        """自定义词典应能改善审计领域专有名词的切分。"""
        text = "实质性程序和控制测试是审计中常用的方法，穿行测试用于评价内部控制。"
        result = extractor_with_dict.extract_keywords(text)
        keywords = result.split()
        # 自定义词典中的专有名词应被正确识别为整体
        assert any("实质性程序" == k for k in keywords) or any("控制测试" == k for k in keywords)

    # ------------------------------------------------------------------ #
    #  摘要提取
    # ------------------------------------------------------------------ #

    def test_extract_summary_empty(self, extractor):
        assert extractor.extract_summary("") == ""

    def test_extract_summary_short_text(self, extractor):
        text = "内部审计是独立、客观的确认活动。"
        result = extractor.extract_summary(text, is_parent=True)
        # 短文本直接返回全文
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
        # TextRank 应能提取到包含核心概念的句子
        assert len(result) >= 10

    def test_extract_summary_children_chunk(self, extractor):
        text = (
            "风险评估是识别和分析相关风险以实现目标的过程。"
            "它包括风险识别、风险分析和风险评价三个步骤。"
            "组织应当建立系统的风险评估机制，确保及时发现潜在风险。"
        )
        result = extractor.extract_summary(text, is_parent=False)
        # Children chunk 取首句
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
        # 小于阈值，直接返回全文
        result = extractor.extract_summary(text, is_parent=True)
        assert result == text

    def test_custom_dict_path_resolution(self):
        """测试自定义词典路径解析（相对路径、绝对路径、不存在路径）。"""
        # 1. 绝对路径
        abs_path = Path(__file__).parent.parent / "src" / "utils" / "custom_dict.txt"
        ext = MetadataExtractor(custom_dict_path=str(abs_path))
        assert ext is not None

        # 2. 相对路径（从项目根目录出发）
        rel_path = "src/utils/custom_dict.txt"
        ext2 = MetadataExtractor(custom_dict_path=rel_path)
        assert ext2 is not None

        # 3. 不存在的路径（应记录 warning，但不抛异常）
        ext3 = MetadataExtractor(custom_dict_path="/nonexistent/dict.txt")
        assert ext3 is not None

    # ------------------------------------------------------------------ #
    #  端到端集成
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
