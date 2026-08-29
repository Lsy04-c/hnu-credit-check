import argparse
import json
import os
import re
import sys

import pdfplumber
import requests

API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-4.7-flash"
PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "docs", "培养方案提取任务提示词.md")


def extract_pdf_text(pdf_path):
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def load_prompt():
    with open(PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read()


def call_glm(prompt, pdf_text, api_key):
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"以下是待提取的培养方案原文：\n\n{pdf_text}"},
    ]
    resp = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": MODEL, "messages": messages, "temperature": 0.1},
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def parse_json_response(raw_text):
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
        cleaned = re.sub(r"\n```$", "", cleaned)
    return json.loads(cleaned)


def main():
    parser = argparse.ArgumentParser(description="批量提取培养方案 PDF 为结构化 JSON")
    parser.add_argument("pdf_path", help="培养方案 PDF 文件路径")
    parser.add_argument("--out-dir", default="data", help="输出目录，默认 data/")
    args = parser.parse_args()

    api_key = os.environ.get("GLM_API_KEY")
    if not api_key:
        print("请先设置环境变量 GLM_API_KEY，例如：export GLM_API_KEY=你的key", file=sys.stderr)
        sys.exit(1)

    prompt = load_prompt()
    pdf_text = extract_pdf_text(args.pdf_path)
    if not pdf_text.strip():
        print(f"警告：{args.pdf_path} 提取不到文字，可能是扫描图片版 PDF，这个脚本处理不了", file=sys.stderr)
        sys.exit(1)

    raw = call_glm(prompt, pdf_text, api_key)

    try:
        data = parse_json_response(raw)
    except json.JSONDecodeError:
        print("模型返回的不是合法 JSON，原始输出如下：", file=sys.stderr)
        print(raw, file=sys.stderr)
        sys.exit(1)

    plan_id = data.get("plan_id", "unknown")
    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, f"plan_{plan_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    verification = data.get("verification", {})
    issues = verification.get("issues", [])
    matches = verification.get("category_sum_matches_total")

    print(f"已保存到 {out_path}")
    print(f"verification.category_sum_matches_total = {matches}")
    if issues:
        print(f"注意：有 {len(issues)} 条 issues，需要人工核对，不要直接当可信数据用：")
        for issue in issues:
            print(f"  - {issue}")


if __name__ == "__main__":
    main()
