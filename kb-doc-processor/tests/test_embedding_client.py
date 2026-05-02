import pytest

from src.config import EmbeddingConfig
from src.embedding_client import EmbeddingClient


class TestEmbeddingClient:
    def test_embed_empty_list(self):
        config = EmbeddingConfig(
            url="http://192.168.30.47:31296/embeddings",
            timeout_seconds=60,
            max_retries=3,
            model_name="BGE-zh-v1.5",
            dim=1024,
        )
        client = EmbeddingClient(config)
        result = client.embed([])
        assert result == []

    def test_dim_property(self):
        config = EmbeddingConfig(
            url="http://192.168.30.47:31296/embeddings",
            dim=1024,
        )
        client = EmbeddingClient(config)
        assert client.dim == 1024

    def test_model_name_property(self):
        config = EmbeddingConfig(
            url="http://192.168.30.47:31296/embeddings",
            model_name="BGE-zh-v1.5",
        )
        client = EmbeddingClient(config)
        assert client.model_name == "BGE-zh-v1.5"
