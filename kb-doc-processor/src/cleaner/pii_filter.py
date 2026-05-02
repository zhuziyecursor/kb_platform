# PHASE2: PIIFilter 用于敏感信息脱敏（身份证号、手机号、银行卡号、姓名等）。
# 二期启用条件：
#   1. 数据合规评审已通过
#   2. 脱敏规则（正则 + NER 模型）已评审
#   3. 脱敏白名单配置就位
# 依赖：presidio-analyzer, presidio-anonymizer（或自研 NER 模型）


from src.cleaner import BaseCleaner, CleanResult


class PIIFilter(BaseCleaner):
    def __init__(self):
        raise NotImplementedError(
            "PHASE2_PLACEHOLDER: PIIFilter 二期启用。"
            "需要完成数据合规评审 + 脱敏规则定稿。"
            "一期不进行 PII 脱敏处理。"
        )

    def clean(self, text: str, metadata: dict | None = None) -> CleanResult:
        raise NotImplementedError("PHASE2_PLACEHOLDER")
