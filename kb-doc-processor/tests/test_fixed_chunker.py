import pytest

from src.chunker.fixed_length_chunker import FixedLengthChunker

CHUNK = 100  # 最小合法 chunk_size


class TestFixedLengthChunker:
    def test_head_first_basic(self):
        chunker = FixedLengthChunker(chunk_size=CHUNK, overlap_ratio=10, mode="HEAD_FIRST")
        text = "A" * 250
        result = chunker.chunk(text)
        assert len(result.chunks) >= 2
        assert result.chunks[0].text == text[:CHUNK]
        assert result.chunks[0].chunk_seq == 0
        # stride = 100 - 10 = 90, so chunk[1] starts at 90
        assert result.chunks[1].text[:10] == text[90:100]

    def test_head_first_overlap(self):
        chunker = FixedLengthChunker(chunk_size=CHUNK, overlap_ratio=20, mode="HEAD_FIRST")
        text = "A" * 300
        result = chunker.chunk(text)
        # overlap = 20, stride = 80. chunk[1] starts at 80.
        # chunk[0][80:100] should equal chunk[1][:20]
        assert result.chunks[0].text[80:] == result.chunks[1].text[:20]

    def test_tail_first(self):
        chunker = FixedLengthChunker(chunk_size=CHUNK, overlap_ratio=10, mode="TAIL_FIRST")
        text = "A" * 250
        result = chunker.chunk(text)
        assert result.chunks[-1].text.endswith(text[-1])

    def test_uniform(self):
        chunker = FixedLengthChunker(chunk_size=CHUNK, overlap_ratio=0, mode="UNIFORM")
        text = "A" * 300
        result = chunker.chunk(text)
        assert len(result.chunks) == 3
        assert sum(c.char_count for c in result.chunks) == 300

    def test_short_text(self):
        chunker = FixedLengthChunker(chunk_size=512, overlap_ratio=10, mode="HEAD_FIRST")
        text = "Short text"
        result = chunker.chunk(text)
        assert len(result.chunks) == 1
        assert result.chunks[0].text == text

    def test_empty_text(self):
        chunker = FixedLengthChunker(chunk_size=512, overlap_ratio=10, mode="HEAD_FIRST")
        result = chunker.chunk("")
        assert len(result.chunks) == 0

    def test_sequential_indices(self):
        chunker = FixedLengthChunker(chunk_size=512, overlap_ratio=10, mode="HEAD_FIRST")
        text = "A" * 2000
        result = chunker.chunk(text)
        for i, chunk in enumerate(result.chunks):
            assert chunk.chunk_seq == i

    def test_token_count_estimate(self):
        chunker = FixedLengthChunker(chunk_size=CHUNK, overlap_ratio=10, mode="HEAD_FIRST")
        text = "测试中文文本" * 20
        result = chunker.chunk(text)
        for chunk in result.chunks:
            assert chunk.token_count == max(1, int(chunk.char_count / 1.5))

    def test_invalid_chunk_size(self):
        with pytest.raises(ValueError):
            FixedLengthChunker(chunk_size=50, overlap_ratio=10)

    def test_invalid_overlap_ratio(self):
        with pytest.raises(ValueError):
            FixedLengthChunker(chunk_size=512, overlap_ratio=60)

    def test_invalid_mode(self):
        with pytest.raises(ValueError):
            FixedLengthChunker(chunk_size=512, overlap_ratio=10, mode="INVALID")
