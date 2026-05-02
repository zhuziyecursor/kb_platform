import re

from src.cleaner import BaseCleaner, CleanResult


class TextCleaner(BaseCleaner):
    def clean(self, text: str, metadata: dict | None = None) -> CleanResult:
        issues: list[str] = []
        quality_deductions = 0.0

        cleaned = self._normalize_encoding(text, issues)

        cleaned, html_count = self._remove_html(cleaned)
        if html_count > 0:
            issues.append(f"Removed {html_count} HTML tag(s)")
            quality_deductions += min(html_count * 0.5, 10.0)

        cleaned, special_count = self._normalize_special_chars(cleaned)
        if special_count > 0:
            issues.append(f"Normalized {special_count} special character(s)")

        cleaned = self._detect_and_clean_headers_footers(cleaned, issues)

        cleaned = self._compress_blank_lines(cleaned)

        quality_score = round(max(100.0 - quality_deductions, 0.0), 1)
        return CleanResult(cleaned_text=cleaned, quality_score=quality_score, issues=issues)

    def _normalize_encoding(self, text: str, issues: list[str]) -> str:
        text = text.replace(chr(0), "")
        text = text.replace("﻿", "")  # BOM
        text = text.replace("\r\n", "\n")
        text = text.replace("\r", "\n")

        garbage_pattern = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
        count = len(garbage_pattern.findall(text))
        if count > 0:
            issues.append(f"Stripped {count} control character(s)")
        text = garbage_pattern.sub("", text)

        return text

    def _remove_html(self, text: str) -> tuple[str, int]:
        html_pattern = re.compile(r'<[^>]+>')
        matches = html_pattern.findall(text)
        return html_pattern.sub("", text), len(matches)

    def _normalize_special_chars(self, text: str) -> tuple[str, int]:
        """全角英文数字→半角，中文标点规范化。"""
        count = 0
        result_chars = []
        for ch in text:
            code = ord(ch)
            if 0xFF01 <= code <= 0xFF5E:
                result_chars.append(chr(code - 0xFEE0))
                count += 1
            elif code == 0x3000:
                result_chars.append(" ")
                count += 1
            else:
                result_chars.append(ch)
        return "".join(result_chars), count

    def _detect_and_clean_headers_footers(self, text: str, issues: list[str]) -> str:
        lines = text.split("\n")
        if len(lines) < 5:
            return text

        from collections import Counter
        line_counts = Counter(lines)
        threshold = max(2, len(lines) // 3)

        repetitive_lines = {l for l, c in line_counts.items() if c >= threshold and len(l.strip()) > 0}
        if repetitive_lines:
            issues.append(f"Detected {len(repetitive_lines)} repetitive line(s) as header/footer")
            lines = [l for l in lines if l not in repetitive_lines]

        return "\n".join(lines)

    def _compress_blank_lines(self, text: str) -> str:
        return re.sub(r'\n{3,}', '\n\n', text)
