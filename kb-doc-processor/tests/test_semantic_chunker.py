from src.chunker.semantic_chunker import SemanticChunker
from src.chunker.fixed_length_chunker import FixedLengthChunker
from src.chunker.llm_chunker import LLMChunker
from src.chunker import estimate_tokens
from src.config import SmartChunkConfig
from unittest.mock import patch, MagicMock


def test_semantic_chunker_uses_unique_monotonic_chunk_seq_for_parent_child():
    text = """
第一章 总则

第一条 为规范采购管理，明确审批责任，制定本办法。采购申请应当真实、完整、准确，并保留审批记录。申请部门应说明采购背景、预算来源、供应商选择依据、验收标准和风险控制要求。

第二条 本办法适用于公司所有采购活动。各部门必须按照预算、合同、验收要求执行。涉及重大金额、长期服务或关键供应商的采购事项，应当补充合规审查意见并纳入后续监督。

第二章 审批流程

第三条 采购合同审批包括申请、部门审核、财务审核和授权审批。任何部门不得绕过审批流程。审批记录、合同版本、补充协议和验收材料应统一归档，作为后续审计追溯依据。
""".strip()

    result = SemanticChunker(chunk_size=512, overlap_ratio=10).chunk(text)

    seqs = [chunk.chunk_seq for chunk in result.chunks]
    assert seqs == list(range(len(result.chunks)))
    assert len(seqs) == len(set(seqs))
    assert any(chunk.is_parent for chunk in result.chunks)
    assert any(not chunk.is_parent for chunk in result.chunks)


def test_semantic_chunker_emits_parent_before_children():
    text = """
第一章 总则

第一条 为规范采购管理，明确审批责任，制定本办法。采购申请应当真实、完整、准确，并保留审批记录。申请部门应说明采购背景、预算来源、供应商选择依据、验收标准和风险控制要求。
""".strip()

    result = SemanticChunker(chunk_size=512, overlap_ratio=10).chunk(text)

    first_parent_index = next(i for i, chunk in enumerate(result.chunks) if chunk.is_parent)
    first_child_index = next(i for i, chunk in enumerate(result.chunks) if not chunk.is_parent)
    assert first_parent_index < first_child_index


def test_semantic_chunker_custom_params():
    """验证自定义 parent_max_size/child_size/child_overlap 参数生效"""
    text = """
第一章 概述

这是第一段测试文本，用于验证自定义参数是否生效。应该产生更小的 Parent 块。

第二章 详情

这是第二段测试文本，继续验证 Parent 块的拆分逻辑。当 parent_max_size 非常小时应该拆成多个块。
""".strip()

    result = SemanticChunker(
        chunk_size=512,
        overlap_ratio=10,
        parent_max_size=100,
        child_size=80,
        child_overlap=10,
    ).chunk(text)

    # 参数较小时应该产生更多 Parent 块
    parent_chunks = [c for c in result.chunks if c.is_parent]
    child_chunks = [c for c in result.chunks if not c.is_parent]

    assert len(parent_chunks) > 0
    assert len(child_chunks) > 0
    # parent_max_size=100 意味着每个 Parent 不应超过 100 字符
    for pc in parent_chunks:
        assert len(pc.text) <= 100
    # child_size=80 意味着每个 Child 不应超过 80 字符
    for cc in child_chunks:
        assert len(cc.text) <= 80


def test_fixed_length_snaps_to_boundary():
    """验证固定长度切分的边界感知能力"""
    text = "这是第一句话。这是第二句话。这是第三句话。这是第四句话。这是第五句话。这是第六句话。这是第七句话。这是第八句话。"

    # 不启用边界感知
    result_no_snap = FixedLengthChunker(chunk_size=100, overlap_ratio=10, snap_to_boundary=False).chunk(text)
    # 启用边界感知
    result_snap = FixedLengthChunker(chunk_size=100, overlap_ratio=10, snap_to_boundary=True).chunk(text)

    # 边界感知版本应该在句号处结束
    for chunk in result_snap.chunks:
        if len(chunk.text) > 10:
            # 块结尾应该是句号或原文本结尾
            assert chunk.text[-1] in ('。', text[-1]) or chunk.text.endswith(text[-2:])

    # 两种模式下都应产生 chunk
    assert result_no_snap.total_chunks > 0
    assert result_snap.total_chunks > 0


def test_llm_chunker_produces_children():
    """验证 LLMChunker 在 mock LLM 响应时产生 Child chunk"""
    text = """
第一章 总则

第一条 为规范采购管理，明确审批责任，制定本办法。采购申请应当真实、完整、准确，并保留审批记录。

第二条 本办法适用于公司所有采购活动。各部门必须按照预算执行。

第二章 审批

第三条 采购审批包括申请、部门审核、财务审核。任何部门不得绕过审批流程。
""".strip()

    mock_config = MagicMock()
    mock_config.api_key = "test-key"
    mock_config.api_base = "https://test.api/v1"
    mock_config.model = "test-model"
    mock_config.temperature = 0.0
    mock_config.max_tokens = 4096
    mock_config.timeout_seconds = 10
    mock_config.max_retries = 1
    mock_config.batch_paragraphs = 80
    mock_config.batch_overlap = 10

    smart_config = SmartChunkConfig(parent_max_size=1500, child_size=400, child_overlap=50)

    with patch('src.llm_client.MinimaxClient.chunk_boundaries') as mock_boundaries:
        # Mock 返回两组边界：第0段→第一组，第1段→第二组
        mock_boundaries.return_value = [[0, 0], [1, 2]]

        chunker = LLMChunker(
            config=mock_config,
            chunk_size=1024,
            overlap_ratio=10,
            smart_config=smart_config,
        )
        result = chunker.chunk(text)

        parents = [c for c in result.chunks if c.is_parent]
        children = [c for c in result.chunks if not c.is_parent]

        assert len(parents) == 2, f"Expected 2 parent chunks, got {len(parents)}"
        assert len(children) > 0, f"Expected child chunks, got 0"


def test_token_estimation():
    """验证 token 估算函数"""
    # 纯中文
    cn = estimate_tokens("知识库平台开发")
    assert cn > 0

    # 空文本
    assert estimate_tokens("") == 0

    # 英文
    en = estimate_tokens("Knowledge base platform development")
    assert en > 0

    # 混合
    mixed = estimate_tokens("这是 knowledge base 平台")
    assert mixed > 0
