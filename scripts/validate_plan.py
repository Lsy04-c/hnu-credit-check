import argparse
import json
import sys

ALLOWED_RULE_TYPES = {"min_credits_in_group", "min_credits_in_groups", "remainder_open"}
REQUIRED_CATEGORY_FIELDS = ["name", "required_credits", "open_pool", "courses", "rules"]
REQUIRED_COURSE_FIELDS = ["code", "name", "credits"]


def sum_credits(courses):
    return sum(c["credits"] for c in courses)


def validate(data):
    problems = []
    warnings = []

    for field in ["plan_id", "plan_name", "total_required_credits", "categories"]:
        if field not in data:
            problems.append(f"缺少顶层字段：{field}")
    if problems:
        return problems, warnings

    all_codes = []
    empty_code_courses = []

    for category in data["categories"]:
        cname = category.get("name", "<未命名类别>")
        for field in REQUIRED_CATEGORY_FIELDS:
            if field not in category:
                problems.append(f"[{cname}] 缺少类别字段：{field}")

        courses = category.get("courses", [])
        for course in courses:
            for field in REQUIRED_COURSE_FIELDS:
                if field not in course:
                    problems.append(f"[{cname}] 课程缺少字段 {field}：{course}")
            code = course.get("code", "")
            if code:
                all_codes.append(code)
            else:
                empty_code_courses.append(f"{cname} - {course.get('name', '<未命名>')}")

        course_groups = {c.get("group") for c in courses if c.get("group")}

        for rule in category.get("rules", []):
            rtype = rule.get("type")
            if rtype not in ALLOWED_RULE_TYPES:
                problems.append(f"[{cname}] 出现不在允许范围内的规则类型：{rtype}")
                continue

            if rtype == "min_credits_in_group":
                group = rule.get("group")
                if group not in course_groups:
                    problems.append(f"[{cname}] 规则引用的分组 '{group}' 在 courses 里找不到对应课程")
                else:
                    group_credits = sum_credits([c for c in courses if c.get("group") == group])
                    required = category.get("required_credits")
                    if rule.get("mandatory_check", True) and group_credits == required:
                        others_exist = any(c.get("group") != group for c in courses if c.get("group"))
                        if others_exist:
                            warnings.append(
                                f"[{cname}] 规则 min_credits_in_group('{group}', min={rule.get('min')}) 的学分总和"
                                f"（{group_credits}）正好等于类别 required_credits（{required}），"
                                f"而该类别下还存在其他选修分组——建议对照原文确认这些选修课程是否真的是"
                                f"'非必需的额外内容'，而不是被漏算进最低学分要求里"
                            )
            elif rtype == "min_credits_in_groups":
                groups = rule.get("groups", [])
                missing = [g for g in groups if g not in course_groups]
                if missing:
                    problems.append(f"[{cname}] 规则引用的分组 {missing} 在 courses 里找不到对应课程")

        if code_dupes := [c for c in all_codes if all_codes.count(c) > 1]:
            pass  # collected below across whole file

    dupe_codes = sorted({c for c in all_codes if all_codes.count(c) > 1})
    if dupe_codes:
        problems.append(f"课程编号在文件内重复出现：{dupe_codes}")

    if empty_code_courses:
        warnings.append(f"以下课程没有课程编号，核算引擎永远无法匹配到它们：{empty_code_courses}")

    category_sum = sum(c.get("required_credits", 0) for c in data["categories"])
    total = data.get("total_required_credits")
    if category_sum != total:
        warnings.append(
            f"各类别 required_credits 合计（{category_sum}）与 total_required_credits（{total}）不一致，"
            f"差额 {total - category_sum}——如果原文本身有开放学分池（如“不限”类别），这是正常的，"
            f"不是错误；但请确认差额来源已经在某个 note/rule 里写清楚了"
        )

    verification = data.get("verification", {})
    issues = verification.get("issues", [])
    if issues:
        warnings.append(f"提取时自报的 verification.issues（{len(issues)} 条），需要人工确认：{issues}")

    return problems, warnings


def main():
    parser = argparse.ArgumentParser(description="校验培养方案 JSON 是否符合 schema 约定")
    parser.add_argument("json_path")
    args = parser.parse_args()

    with open(args.json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    problems, warnings = validate(data)

    print(f"=== 校验 {args.json_path} ===")
    if problems:
        print(f"\n发现 {len(problems)} 个硬性问题（结构性错误，必须修复）：")
        for p in problems:
            print(f"  ✗ {p}")
    else:
        print("\n无结构性错误。")

    if warnings:
        print(f"\n发现 {len(warnings)} 条需要人工判断的提示：")
        for w in warnings:
            print(f"  ⚠ {w}")

    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
