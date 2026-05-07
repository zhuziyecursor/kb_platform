"""Verify that forbidden libraries are not importable in rerank-service."""
import importlib


FORBIDDEN_IMPORTS = ["pymilvus"]


def test_forbidden_imports_not_available():
    for lib in FORBIDDEN_IMPORTS:
        try:
            importlib.import_module(lib)
            assert False, f"FORBIDDEN: {lib} should not be importable in rerank-service"
        except ModuleNotFoundError:
            pass
