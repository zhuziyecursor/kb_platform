#!/usr/bin/env python3
"""
Offline retrieval evaluation harness.

Reads golden-set/*.json query specs and runs each query against a deployed
rag-service instance. Computes Recall@1/3/5, MRR, and nDCG@5 per category and
overall, then writes a JSON report.

Usage:
    python run_eval.py \\
        --golden-set ../../kb-mcp/rag-service/src/test/resources/golden-set \\
        --base-url http://localhost:31005 \\
        --tenant tenant-a \\
        --token <jwt-or-dev-token> \\
        --out /tmp/rag-eval-$(date +%Y%m%d-%H%M).json

The script is intentionally provider-agnostic: any `/rag/v1/chat`-compatible
endpoint will do. Refusal expectations are honored: queries with
`should_refuse=true` count as success only when the API returns a refusal
(reason in {NO_MATCH, NO_PERMISSION, LOW_CONFIDENCE, DENSE_UNAVAILABLE}).
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("Missing dependency 'requests'. Install with: pip install requests", file=sys.stderr)
    sys.exit(2)


REFUSAL_REASONS = {"NO_MATCH", "NO_PERMISSION", "LOW_CONFIDENCE", "DENSE_UNAVAILABLE"}


@dataclass
class GoldenQuery:
    id: str
    query: str
    ideal_doc_ids: list[str]
    ideal_chunk_seqs: list[int]
    acceptable_alt_doc_ids: list[str]
    should_refuse: bool
    tags: list[str] = field(default_factory=list)
    category: str = ""


@dataclass
class QueryResult:
    query_id: str
    category: str
    matched: bool          # any ideal/alt doc in citations
    refused: bool          # API returned refusal
    rank: int | None       # rank (1-based) of first ideal hit; None if not found
    latency_ms: int
    refusal_reason: str | None
    citations: list[dict[str, Any]]


def load_golden_set(folder: Path) -> list[GoldenQuery]:
    queries: list[GoldenQuery] = []
    for file in sorted(folder.glob("*.json")):
        with file.open() as f:
            data = json.load(f)
        cat = data.get("category") or file.stem
        for q in data.get("queries", []):
            queries.append(GoldenQuery(
                id=q["id"],
                query=q["query"],
                ideal_doc_ids=q.get("ideal_doc_ids", []),
                ideal_chunk_seqs=q.get("ideal_chunk_seqs", []),
                acceptable_alt_doc_ids=q.get("acceptable_alt_doc_ids", []),
                should_refuse=q.get("should_refuse", False),
                tags=q.get("tags", []),
                category=cat,
            ))
    return queries


def run_query(base_url: str, tenant: str, token: str | None, query: str, top_k: int = 5) -> tuple[dict[str, Any], int]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = {"tenantId": tenant, "query": query, "topK": top_k}

    started = time.monotonic()
    resp = requests.post(f"{base_url}/rag/v1/chat", json=payload, headers=headers, timeout=30)
    latency_ms = int((time.monotonic() - started) * 1000)
    resp.raise_for_status()
    return resp.json(), latency_ms


def score_query(q: GoldenQuery, body: dict[str, Any], latency_ms: int) -> QueryResult:
    citations: list[dict[str, Any]] = body.get("citations", []) or []
    refused = bool(body.get("reason"))
    reason = body.get("reason")

    # Refusal expectations short-circuit
    if q.should_refuse:
        matched = refused and reason in REFUSAL_REASONS
        return QueryResult(q.id, q.category, matched, refused, None, latency_ms, reason, citations)

    rank = None
    acceptable = set(q.ideal_doc_ids) | set(q.acceptable_alt_doc_ids)
    for i, c in enumerate(citations, start=1):
        doc_id = c.get("docId") or c.get("doc_id")
        if doc_id in acceptable:
            rank = i
            break

    return QueryResult(
        query_id=q.id, category=q.category,
        matched=rank is not None,
        refused=refused, rank=rank,
        latency_ms=latency_ms, refusal_reason=reason, citations=citations,
    )


def recall_at_k(results: list[QueryResult], k: int) -> float:
    if not results: return 0.0
    hits = sum(1 for r in results if r.rank is not None and r.rank <= k)
    return hits / len(results)


def mrr(results: list[QueryResult]) -> float:
    if not results: return 0.0
    return sum(1.0 / r.rank for r in results if r.rank) / len(results)


def ndcg_at_5(results: list[QueryResult]) -> float:
    if not results: return 0.0
    vals = []
    for r in results:
        if r.rank is None or r.rank > 5:
            vals.append(0.0)
        else:
            vals.append(1.0 / math.log2(r.rank + 1))
    return statistics.mean(vals)


def aggregate(results: list[QueryResult]) -> dict[str, Any]:
    refusal_correct = sum(1 for r in results if r.query_id.startswith("chitchat") and r.matched)
    return {
        "count": len(results),
        "recall@1": round(recall_at_k(results, 1), 4),
        "recall@3": round(recall_at_k(results, 3), 4),
        "recall@5": round(recall_at_k(results, 5), 4),
        "mrr": round(mrr(results), 4),
        "ndcg@5": round(ndcg_at_5(results), 4),
        "refused": sum(1 for r in results if r.refused),
        "refusal_correct": refusal_correct,
        "latency_ms_p50": int(statistics.median([r.latency_ms for r in results])) if results else 0,
        "latency_ms_p95": _percentile([r.latency_ms for r in results], 0.95) if results else 0,
    }


def _percentile(values: list[int], p: float) -> int:
    if not values: return 0
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, int(math.ceil(p * len(sorted_vals))) - 1))
    return sorted_vals[idx]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run RAG retrieval evaluation against a deployed rag-service.")
    parser.add_argument("--golden-set", type=Path, required=True, help="Path to golden-set directory.")
    parser.add_argument("--base-url", default="http://localhost:31005", help="rag-service base URL.")
    parser.add_argument("--tenant", required=True, help="Tenant ID to query against.")
    parser.add_argument("--token", default=None, help="Bearer token for /rag/v1/chat.")
    parser.add_argument("--out", type=Path, required=True, help="Output report path (JSON).")
    parser.add_argument("--top-k", type=int, default=5, help="topK passed to /rag/v1/chat.")
    args = parser.parse_args()

    if not args.golden_set.is_dir():
        print(f"golden-set path not found: {args.golden_set}", file=sys.stderr)
        return 2

    golden = load_golden_set(args.golden_set)
    if not golden:
        print("No golden queries loaded; aborting.", file=sys.stderr)
        return 2

    results: list[QueryResult] = []
    for q in golden:
        try:
            body, latency_ms = run_query(args.base_url, args.tenant, args.token, q.query, args.top_k)
            results.append(score_query(q, body, latency_ms))
        except Exception as e:
            print(f"Query {q.id} failed: {e}", file=sys.stderr)
            results.append(QueryResult(q.id, q.category, False, False, None, 0, f"ERROR: {e}", []))

    per_category: dict[str, list[QueryResult]] = {}
    for r in results:
        per_category.setdefault(r.category, []).append(r)

    report = {
        "summary": aggregate(results),
        "per_category": {cat: aggregate(rs) for cat, rs in per_category.items()},
        "queries": [
            {
                "id": r.query_id, "category": r.category,
                "matched": r.matched, "refused": r.refused, "rank": r.rank,
                "latency_ms": r.latency_ms, "refusal_reason": r.refusal_reason,
            }
            for r in results
        ],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    summary = report["summary"]
    print(f"Eval complete: {summary['count']} queries | "
          f"R@1={summary['recall@1']} R@5={summary['recall@5']} MRR={summary['mrr']} "
          f"p95={summary['latency_ms_p95']}ms")
    print(f"Report: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
