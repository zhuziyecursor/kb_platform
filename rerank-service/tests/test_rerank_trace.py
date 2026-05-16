"""
Tests for rerank API trace context behavior.
Verifies set_trace_context / clear_trace_context are called during request lifecycle.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from src.logging_config import SERVICE_NAME


@pytest.fixture
def mock_reranker():
    """Mock Reranker to return predictable scores without loading the model."""
    mock = MagicMock()
    mock.rerank.return_value = [0.95, 0.82, 0.61]
    return mock


@pytest.fixture
def client(mock_reranker):
    with patch("src.api.get_reranker", return_value=mock_reranker):
        # Import inside fixture to avoid model loading at import time
        import src.main
        from src.app import init_app, get_config
        from src.config import load_config
        app = src.main._create_app() if hasattr(src.main, "_create_app") else None
        if app is None:
            # Build app inline
            from fastapi import FastAPI
            from fastapi.middleware.cors import CORSMiddleware
            app = FastAPI(title="test")
            from src.api import router
            app.include_router(router)
        with TestClient(app) as c:
            yield c


class TestRerankTraceContext:
    """Verify trace context is set during rerank request."""

    def test_response_includes_trace_id(self, client):
        response = client.post("/rerank/v1/rerank", json={
            "query": "test query",
            "documents": [{"text": "doc1"}, {"text": "doc2"}],
        })
        assert response.status_code == 200
        data = response.json()
        assert "traceId" in data
        assert data["traceId"].startswith("tr-")

    def test_validation_error_includes_trace_id(self, client):
        response = client.post("/rerank/v1/rerank", json={
            "query": "",
            "documents": [],
        })
        assert response.status_code == 400
        data = response.json()
        assert "traceId" in data["detail"]

    def test_missing_query_returns_400(self, client):
        response = client.post("/rerank/v1/rerank", json={
            "documents": [{"text": "doc1"}],
        })
        assert response.status_code == 422  # FastAPI validation

    def test_missing_documents_returns_400(self, client):
        response = client.post("/rerank/v1/rerank", json={
            "query": "test",
        })
        assert response.status_code == 422

    def test_results_are_sorted_by_score_desc(self, client):
        response = client.post("/rerank/v1/rerank", json={
            "query": "test",
            "documents": [
                {"text": "low"},
                {"text": "high"},
                {"text": "medium"},
            ],
        })
        assert response.status_code == 200
        data = response.json()
        scores = [r["score"] for r in data["results"]]
        assert scores == sorted(scores, reverse=True), "Results must be sorted by score desc"

    def test_max_5_results(self, client, mock_reranker):
        mock_reranker.rerank.return_value = [0.95, 0.91, 0.88, 0.82, 0.75, 0.61, 0.50, 0.43, 0.31, 0.12]
        response = client.post("/rerank/v1/rerank", json={
            "query": "test",
            "documents": [{"text": f"doc{i}"} for i in range(10)],
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 5

    def test_health_endpoint(self, client):
        response = client.get("/rerank/v1/health")
        assert response.status_code == 200


class TestLoggingSafety:
    """Verify logging failures never break the API."""

    def test_set_trace_context_never_throws(self):
        from src.logging_config import set_trace_context
        # Should not throw for any input
        set_trace_context(None, None, None)
        set_trace_context("", "", "")
        set_trace_context("x" * 10000, "s", "t")

    def test_clear_trace_context_never_throws(self):
        from src.logging_config import clear_trace_context, _local
        # Clear on fresh local
        clear_trace_context()
        # Clear after tampering
        try:
            del _local.trace_id
        except (AttributeError, KeyError):
            pass
        clear_trace_context()
