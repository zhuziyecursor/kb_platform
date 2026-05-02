# PHASE2: SemanticChunker 按标题/段落边界进行语义切分。
# 二期启用条件：
#   1. 文档结构解析模型就位（标题层级识别）
#   2. 语义边界检测模型就位（基于 embedding 相似度断点）
# 依赖：sentence-transformers（用于计算相邻句子相似度）


from src.chunker import BaseChunker, ChunkResult


class SemanticChunker(BaseChunker):
    def __init__(self):
        raise NotImplementedError(
            "PHASE2_PLACEHOLDER: SemanticChunker 二期启用。"
            "需要标题层级识别 + embedding 相似度断点检测模型就位。"
            "一期请使用 FixedLengthChunker。"
        )

    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        raise NotImplementedError("PHASE2_PLACEHOLDER")
