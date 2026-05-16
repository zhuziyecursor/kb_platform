import requests
import time

EMBEDDING_URL = "http://192.168.30.47:31296/embeddings"


def test_connectivity():
    """测试基础连通性"""
    print(f"测试目标: {EMBEDDING_URL}")
    print("-" * 40)

    # 1. TCP 连通性
    print("1. TCP 连通性测试 ...", end=" ")
    try:
        resp = requests.get(
            "http://192.168.30.47:31296/", timeout=5
        )
        print(f"OK (HTTP {resp.status_code})")
    except requests.exceptions.ConnectionError as e:
        print(f"失败 — Connection refused / unreachable")
        print(f"   详情: {e}")
        return False
    except requests.exceptions.Timeout:
        print("失败 — 连接超时")
        return False

    # 2. Embedding 接口
    print("2. Embedding 接口测试 ...", end=" ")
    try:
        start = time.time()
        resp = requests.post(
            EMBEDDING_URL,
            json={"input": ["你好，测试"]},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        elapsed_ms = int((time.time() - start) * 1000)

        if resp.status_code == 200:
            body = resp.json()
            if body.get("data") and len(body["data"]) > 0:
                emb = body["data"][0].get("embedding", [])
                print(f"OK — {elapsed_ms}ms, dim={len(emb)}")
                return True
            else:
                print(f"失败 — 响应无 data: {body}")
                return False
        else:
            print(f"失败 — HTTP {resp.status_code}: {resp.text[:200]}")
            return False
    except requests.exceptions.Timeout:
        print("失败 — 请求超时")
        return False
    except Exception as e:
        print(f"失败 — {e}")
        return False


if __name__ == "__main__":
    ok = test_connectivity()
    print("-" * 40)
    print("结论: Embedding 服务", "可达" if ok else "不可达")
