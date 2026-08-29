import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from extract_plan import call_glm, extract_pdf_text, load_prompt, parse_json_response  # noqa: E402
from validate_plan import validate  # noqa: E402

PDF_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "pdf")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "pending")


def find_all_pdfs(root):
    pdfs = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in sorted(filenames):
            if name.lower().endswith(".pdf"):
                pdfs.append(os.path.join(dirpath, name))
    return sorted(pdfs)


def safe_out_name(pdf_path):
    rel = os.path.relpath(pdf_path, PDF_ROOT)
    rel = rel[:-4] if rel.lower().endswith(".pdf") else rel
    safe = rel.replace(os.sep, "__").replace(" ", "_")
    return safe + ".json"


def process_one(pdf_path, prompt, api_key):
    out_name = safe_out_name(pdf_path)
    out_path = os.path.join(OUT_DIR, out_name)

    if os.path.exists(out_path):
        return "skipped", out_path, [], []

    pdf_text = extract_pdf_text(pdf_path)
    if not pdf_text.strip():
        return "no_text", out_path, [], []

    raw = call_glm(prompt, pdf_text, api_key)
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        data = parse_json_response(raw)
    except json.JSONDecodeError:
        raw_path = out_path[:-5] + ".raw.txt"
        with open(raw_path, "w", encoding="utf-8") as f:
            f.write(raw)
        raise
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    problems, warnings = validate(data)
    return "done", out_path, problems, warnings


def main():
    api_key = os.environ.get("GLM_API_KEY")
    if not api_key:
        print("请先设置环境变量 GLM_API_KEY", file=sys.stderr)
        sys.exit(1)

    prompt = load_prompt()
    pdfs = find_all_pdfs(PDF_ROOT)
    total = len(pdfs)
    print(f"共找到 {total} 份 PDF，输出目录：{OUT_DIR}\n")

    summary = {"done": [], "skipped": [], "no_text": [], "error": []}

    for i, pdf_path in enumerate(pdfs, 1):
        rel = os.path.relpath(pdf_path, PDF_ROOT)
        print(f"[{i}/{total}] {rel} ...", end=" ", flush=True)
        try:
            status, out_path, problems, warnings = process_one(pdf_path, prompt, api_key)
        except Exception as e:  # noqa: BLE001 - 批量任务里单份失败不能让整批停下
            print(f"失败：{e}")
            summary["error"].append((rel, str(e)))
            continue

        if status == "skipped":
            print("已存在，跳过")
            summary["skipped"].append(rel)
        elif status == "no_text":
            print("提取不到文字（可能是扫描件），跳过")
            summary["no_text"].append(rel)
        else:
            tag = "✗ 硬性问题" if problems else ("⚠ 有提示" if warnings else "✓ 干净")
            print(f"完成 [{tag}]（{len(problems)} 硬性问题，{len(warnings)} 条提示）")
            summary["done"].append((rel, out_path, len(problems), len(warnings)))
        time.sleep(1)  # 简单限速，避免短时间内打爆 API

    print("\n=== 批量提取汇总 ===")
    print(f"成功：{len(summary['done'])}，跳过（已存在）：{len(summary['skipped'])}，"
          f"无文字跳过：{len(summary['no_text'])}，失败：{len(summary['error'])}")

    has_hard_problems = [d for d in summary["done"] if d[2] > 0]
    if has_hard_problems:
        print(f"\n有硬性问题、必须人工修复的 {len(has_hard_problems)} 份：")
        for rel, out_path, n_problems, _ in has_hard_problems:
            print(f"  ✗ {rel} -> {out_path}（{n_problems} 个问题，运行"
                  f" `python3 scripts/validate_plan.py {out_path}` 查看详情）")

    if summary["error"]:
        print(f"\n处理失败的 {len(summary['error'])} 份：")
        for rel, err in summary["error"]:
            print(f"  ✗ {rel}：{err}")

    if summary["no_text"]:
        print(f"\n提取不到文字、疑似扫描件的 {len(summary['no_text'])} 份：")
        for rel in summary["no_text"]:
            print(f"  ⚠ {rel}")


if __name__ == "__main__":
    main()
