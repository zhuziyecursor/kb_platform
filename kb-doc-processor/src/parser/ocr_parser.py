# PHASE2: OCRParser 用于扫描件（图片 PDF、照片等）的文字识别。
# 二期启用条件：
#   1. Tesseract 5.x + EasyOCR 1.7+ 已安装
#   2. 训练好的中英文混合识别模型就位
#   3. GPU 资源已分配（单页 OCR 耗时 <3s）
# 依赖：tesseract, easyocr, Pillow, pdf2image


from typing import Optional

from src.parser import BaseParser, ParseResult


class OCRParser(BaseParser):
    def __init__(self):
        raise NotImplementedError(
            "PHASE2_PLACEHOLDER: OCRParser 二期启用。"
            "需要 Tesseract 5.x + EasyOCR 1.7+，提供扫描件文字识别能力。"
            "一期请使用 TikaParser。"
        )

    def parse(self, file_bytes: bytes, lang_hints: Optional[list[str]] = None) -> ParseResult:
        raise NotImplementedError("PHASE2_PLACEHOLDER")
