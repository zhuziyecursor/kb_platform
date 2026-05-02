import importlib

import pytest

FORBIDDEN_IMPORTS = ["pymilvus", "torch", "sentence_transformers"]


@pytest.mark.parametrize("mod_name", FORBIDDEN_IMPORTS)
def test_forbidden_import_not_available(mod_name: str):
    """验证 kb-doc-processor 环境不安装禁止的库（pymilvus, torch, sentence_transformers）。"""
    spec = importlib.util.find_spec(mod_name)
    assert spec is None, (
        f"FORBIDDEN IMPORT: '{mod_name}' 在 kb-doc-processor 中禁止导入。"
    )
