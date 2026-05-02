from src.cleaner.text_cleaner import TextCleaner


class TestTextCleaner:
    def setup_method(self):
        self.cleaner = TextCleaner()

    def test_normalize_encoding_strips_null_bytes(self):
        result = self.cleaner.clean("hello\x00world")
        assert "\x00" not in result.cleaned_text
        assert "helloworld" in result.cleaned_text

    def test_normalize_encoding_strips_bom(self):
        result = self.cleaner.clean("﻿Hello World")
        assert result.cleaned_text.startswith("Hello")

    def test_normalize_line_endings(self):
        result = self.cleaner.clean("line1\r\nline2\rline3\nline4")
        lines = result.cleaned_text.split("\n")
        assert len(lines) == 4

    def test_remove_html_tags(self):
        result = self.cleaner.clean("<p>Hello</p> <b>World</b>")
        assert "<p>" not in result.cleaned_text
        assert "Hello World" in result.cleaned_text

    def test_fullwidth_to_halfwidth(self):
        result = self.cleaner.clean("ＡＢＣ１２３")
        assert "ABC123" in result.cleaned_text

    def test_compress_blank_lines(self):
        result = self.cleaner.clean("line1\n\n\n\n\nline2")
        assert "\n\n\n\n\n" not in result.cleaned_text

    def test_quality_score_starts_high(self):
        result = self.cleaner.clean("Clean text without issues.")
        assert result.quality_score >= 90.0

    def test_quality_score_drops_with_html(self):
        result = self.cleaner.clean("<div><p>Nested</p><span>HTML</span></div>")
        assert result.quality_score < 100.0

    def test_detect_repetitive_headers(self):
        header = "CONFIDENTIAL — Company Internal Use Only"
        lines = []
        for i in range(10):
            lines.append(header)
            lines.append(f"Content line {i}")
        text = "\n".join(lines)
        result = self.cleaner.clean(text)
        assert header not in result.cleaned_text

    def test_preserves_chinese(self):
        text = "企业知识库平台文档处理服务"
        result = self.cleaner.clean(text)
        assert text in result.cleaned_text
