import requests

API_BASE = "http://192.168.30.47:8000/v1"
MODEL = "/home/hhsk/Qwen-model"

def chat(message, system_prompt=None):
    """发送对话请求"""
    messages = []
    
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    
    messages.append({"role": "user", "content": message})
    
    response = requests.post(
        f"{API_BASE}/chat/completions",
        json={
            "model": MODEL,
            "messages": messages,
        },
        timeout=120
    )
    
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


if __name__ == "__main__":
    # 单轮对话测试
    reply = chat("你好，请介绍一下你自己")
    print(reply)
