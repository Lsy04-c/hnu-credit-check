"""
从 87 份培养方案 JSON + 原始 PDF 生成"全校专业选修课浏览"用的合并数据文件
src/web/data/elective_browse.json。

考核方式（考试/考查）、开课学期（第几学期）、是否限选，现有 plans/*.json 里都没有
这几个字段，只有原始 PDF 表格里有。这里用课程编号（code）在 PDF 文本
（pdftotext -layout）里定位所在行，在其后几行的窗口内找"考试"/"考查"关键字、紧跟
其后的 1-8 单个数字（第几学期）、以及"限选"这个词。code 在同一份 PDF 里唯一，
试点在化学/数学/会计/建筑/机械/法学等 6 个不同学院的 PDF 上验证过考核方式 100%
命中；学期数字和限选标记全量跑了 87 份、2463 条课程，具体见开发记录。

开课学期只精确到"第几学期"（1-8），季节（秋/春）由学期数的奇偶推算——单数学期
（1/3/5/7）是每学年上学期即秋季，双数学期是下学期即春季，这是全国高校通用的学期
编号惯例。这是"根据培养方案里定的教学计划推出来的季节"，不是从实际排课表核实的，
标"推测"，不是"确认"；同一门课不同届学生实际上课的学期可能因版本变化而与新版
培养方案不同（开发过程中跟 2024-2025-1/2025-2026-1 秋季课表 + 2023-2024-2 春季
课表交叉验证时发现过 2 处这样的版本漂移），仅供参考。

是否可跨专业选（cross_college）看的是表格里的"限选"标记，不是课程名里的 *。
每份培养方案对"跨专业选修"类别的备注原话是"学生可修读其他专业的专业课程，带*
课程为优先推荐修读的跨专业课程"——* 只是官方推荐的优先名单，不代表不带 * 就选不了；
真正被排除在外、只对本专业学生开放的，是表格里单独标"限选"的那批课（通常还带
mandatory，是本专业内部的强制选修课）。* 单独存成 recommended 字段。

用法：
    python3 scripts/build_elective_browse.py
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
PLANS_DIR = os.path.join(ROOT, "src", "web", "data", "plans")
PDF_ROOT = os.path.join(ROOT, "src", "web", "data", "pdf")
INDEX_PATH = os.path.join(ROOT, "src", "web", "data", "index.json")
CAMPUS_MAP_PATH = os.path.join(ROOT, "src", "web", "data", "campus_map.json")
OUT_PATH = os.path.join(ROOT, "src", "web", "data", "elective_browse.json")
SCHEDULE_RAW_DIR = os.path.join(ROOT, "data", "schedule_raw")
FALL_SCHEDULE_PATH = os.path.join(SCHEDULE_RAW_DIR, "course_list_elective.json")
SPRING_SCHEDULE_PATH = os.path.join(SCHEDULE_RAW_DIR, "spring_2024_elective.json")

CATEGORY_NAME = "专业选修"


def normalize_course_name(name):
    """去掉培养方案里的 * / # 跨专业/本研贯通标记和空白，方便跟教务系统课表按名字比对。"""
    if name is None:
        return ""
    s = re.sub(r"[*#]+$", "", str(name))
    s = re.sub(r"\s+", "", s)
    return s.replace("（", "(").replace("）", ")")


def load_season_map():
    """
    从秋季课表（2024-2025-1）和春季课表（2023-2024-2）按课程编码分出"只在秋季/
    只在春季/秋春都开"三类，再按课程名归并成 name -> season 的映射，供下面按名字
    合并进培养方案课程用。

    这两份课表来自不同学年，本身只能反映"这几年这门课开在哪个学期"，不代表所有
    专业选修课程都会被覆盖到——没匹配上的会标 None（未知学期），不瞎猜。
    """
    if not (os.path.exists(FALL_SCHEDULE_PATH) and os.path.exists(SPRING_SCHEDULE_PATH)):
        return {}

    fall = json.load(open(FALL_SCHEDULE_PATH, encoding="utf-8"))
    spring = json.load(open(SPRING_SCHEDULE_PATH, encoding="utf-8"))

    fall_by_code = {r["code"]: r["name"] for r in fall["rows"]}
    spring_by_code = {r["code"]: r["name"] for r in spring["rows"]}

    fall_codes = set(fall_by_code)
    spring_codes = set(spring_by_code)
    only_fall = fall_codes - spring_codes
    only_spring = spring_codes - fall_codes
    both = fall_codes & spring_codes

    season_by_name = {}
    for c in only_fall:
        season_by_name[normalize_course_name(fall_by_code[c])] = "秋季"
    for c in only_spring:
        season_by_name[normalize_course_name(spring_by_code[c])] = "春季"
    for c in both:
        season_by_name[normalize_course_name(fall_by_code[c])] = "秋春"
    return season_by_name


def pdftext(path):
    result = subprocess.run(
        ["pdftotext", "-layout", path, "-"], capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext 失败：{path}\n{result.stderr}")
    return result.stdout


def extract_course_fields(codes, pdf_text):
    """
    返回 {code: (exam_type, semester, restricted)}。
    exam_type 是 "考试"/"考查"/None；semester 是 1-8 的整数（第几学期）或 None；
    restricted 表示这门课在原文里是否标了"限选"——87 份培养方案统一注明
    "*代表跨专业选修课程"，但备注原话是"学生可修读其他专业的专业课程，带*课程为
    优先推荐修读的跨专业课程"：*只是官方推荐的优先名单，不代表没带*就不能跨专业选；
    真正明确排除在外、只对本专业学生开放的，是表格里单独标"限选"的那一小撮课程
    （这批课通常还带 mandatory 标记，是本专业的必修性质选修课）。

    窗口取"课程编号所在行"到"下一门课编号所在行之前"（不含下一行），避免两门课
    紧挨着时，属于下一门课自己的"限选"标记被错误地算到上一门课头上——早期用包含
    下一行的宽窗口时出过这个问题。semester 优先在"考试"/"考查"关键字之后找，找不到
    时退回到课程编号自己所在的那一行找最后一个 1-8 单数字兜底（应对课程名太长换行、
    "考核方式"被挤到下一行、和编号本身不在同一逻辑列的极少数情况）。
    """
    lines = pdf_text.split("\n")
    # 个别 PDF 的字体渲染会在课程编号中间插入多余空格（如 "DZ122 JQ24"），
    # 去空格后再做子串匹配，兼容这种情况。
    lines_nospace = [re.sub(r"\s+", "", line) for line in lines]
    code_line = {}
    for i, line_nospace in enumerate(lines_nospace):
        for code in codes:
            if code in code_line:
                continue
            if code in line_nospace:
                code_line[code] = i

    results = {}
    ordered = sorted(code_line.items(), key=lambda kv: kv[1])
    for idx, (code, lineno) in enumerate(ordered):
        next_lineno = ordered[idx + 1][1] if idx + 1 < len(ordered) else lineno + 6
        window = lines[lineno: min(next_lineno, lineno + 6)]
        joined = "\n".join(window)

        exam_match = re.search(r"考试|考查", joined)
        exam_type = exam_match.group(0) if exam_match else None

        semester = None
        if exam_match:
            tail = joined[exam_match.end():]
            sem_match = re.search(r"\b([1-8])\b", tail)
            if sem_match:
                semester = int(sem_match.group(1))
        if semester is None:
            own_line = lines[lineno]
            own_matches = re.findall(r"\b([1-8])\b", own_line)
            if own_matches:
                semester = int(own_matches[-1])

        restricted = "限选" in joined

        results[code] = (exam_type, semester, restricted)

    for code in codes:
        results.setdefault(code, (None, None, False))
    return results


def main():
    index = json.load(open(INDEX_PATH, encoding="utf-8"))
    campus_map = json.load(open(CAMPUS_MAP_PATH, encoding="utf-8"))["groups"]
    season_by_name = load_season_map()

    plans_out = []
    skipped_no_category = []
    skipped_no_campus = []
    stats_missing_code = 0
    stats_no_keyword = 0
    stats_total_courses = 0
    stats_season_from_semester = 0
    stats_season_from_schedule = 0
    stats_season_unknown = 0

    for entry in index:
        plan_path = os.path.join(PLANS_DIR, entry["json_file"])
        plan = json.load(open(plan_path, encoding="utf-8"))
        cat = next((c for c in plan["categories"] if c["name"] == CATEGORY_NAME), None)
        if cat is None or not cat.get("courses"):
            skipped_no_category.append(entry["plan_id"])
            continue

        folder = entry["pdf_file"].split("/")[0]
        campus_info = campus_map.get(folder)
        if campus_info is None:
            skipped_no_campus.append((entry["plan_id"], folder))
            campus_info = {"campus": "未分类", "college": folder}

        pdf_path = os.path.join(PDF_ROOT, entry["pdf_file"])
        text = pdftext(pdf_path)
        codes = [c["code"] for c in cat["courses"]]
        extracted = extract_course_fields(codes, text)

        courses = []
        for c in cat["courses"]:
            exam_type, semester, restricted = extracted.get(c["code"], (None, None, False))
            if exam_type is None:
                stats_no_keyword += 1

            if semester is not None:
                season = "秋季" if semester % 2 == 1 else "春季"
                season_is_guess = True
                stats_season_from_semester += 1
            else:
                # 极少数（全量测试里 2463 条只有 1 条）提取不到学期数字时，
                # 退回按课程名匹配秋/春季课表的结果兜底。
                season = season_by_name.get(normalize_course_name(c["name"]))
                season_is_guess = False
                if season is not None:
                    stats_season_from_schedule += 1
                else:
                    stats_season_unknown += 1

            # 每份培养方案都有备注"*代表跨专业选修课程，#代表本研贯通课程"，但对"跨专业选修"
            # 类别本身的说明是"学生可修读其他专业的专业课程，带*课程为优先推荐修读的跨专业课程"——
            # 也就是说 * 只是官方推荐的优先名单，不代表不带 * 就选不了。真正明确排除在外、
            # 只对本专业学生开放的，是表格里单独标"限选"的那批课（通常还带 mandatory）。
            # 所以 cross_college（能不能选）看 restricted，recommended（是否官方推荐优先）看 *。
            cross_college = not restricted
            recommended = "*" in c["name"]

            courses.append(
                {
                    "code": c["code"],
                    "name": c["name"],
                    "credits": c["credits"],
                    "group": c.get("group"),
                    "exam_type": exam_type,  # "考试" | "考查" | None(未知)
                    "semester": semester,  # 1-8（第几学期）| None
                    "season": season,  # "秋季" | "春季" | "秋春" | None(未知)
                    "season_is_guess": season_is_guess,  # True=按学期奇偶推算，False=按实际课表匹配
                    "cross_college": cross_college,  # True=其他专业学生可以选，False=表格里标了"限选"，仅本专业
                    "recommended": recommended,  # True=课程名带*，官方优先推荐的跨专业选修课程
                }
            )
        stats_total_courses += len(courses)

        plans_out.append(
            {
                "plan_id": entry["plan_id"],
                "plan_name": entry["plan_name"],
                "campus": campus_info["campus"],
                "college": campus_info.get("college"),
                "campus_note": campus_info.get("note"),
                "required_credits": cat.get("required_credits"),
                "courses": courses,
            }
        )

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_note": "本文件由 scripts/build_elective_browse.py 从 plans/*.json + 原始 PDF 生成，"
                "考核方式字段为本地 pdftotext 文本匹配得到的最佳猜测，未经过人工逐条核对，"
                "标为 null 的表示没能可靠识别，浏览时请以 PDF 原文为准。"
                "开课学期（season）绝大多数是按培养方案里标注的'第几学期'（semester字段）的奇偶推算的"
                "（单数=秋季，双数=春季），是根据教学计划推出来的'推测'，不是从实际课表核实的"
                "（season_is_guess=true）；极少数提取不到学期数字的课程会退回按课程名匹配"
                "2024-2025-1/2025-2026-1秋季课表和2023-2024-2春季课表的结果（season_is_guess=false，"
                "这部分是从实际课表里查到的，但覆盖面很有限）。两种情况都仅供参考，具体开课学期请以教务系统为准。"
                "cross_college 字段看的是表格里的'限选'标记，不是课程名里的*：标'限选'的课只对本专业"
                "学生开放，其余默认其他专业学生都能选。recommended 字段才是课程名带*，代表官方推荐"
                "优先修读的跨专业课程（不是'能不能选'，是'官方推不推荐'）。",
                "plans": plans_out,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"生成 {OUT_PATH}")
    print(f"纳入专业数：{len(plans_out)}，跳过（无专业选修类别）：{skipped_no_category}")
    if skipped_no_campus:
        print(f"未找到校区映射（已标注为'未分类'）：{skipped_no_campus}")
    print(f"专业选修课程总条数（含跨专业重复）：{stats_total_courses}")
    print(f"考核方式未能识别的条数：{stats_no_keyword}（{stats_no_keyword/stats_total_courses:.1%}）")
    print(f"开课学期：{stats_season_from_semester} 条按学期奇偶推算"
          f"（{stats_season_from_semester/stats_total_courses:.1%}），"
          f"{stats_season_from_schedule} 条按实际课表兜底，"
          f"{stats_season_unknown} 条未知")
    restricted_count = sum(1 for p in plans_out for c in p["courses"] if not c["cross_college"])
    recommended_count = sum(1 for p in plans_out for c in p["courses"] if c["recommended"])
    print(f"限选（仅本专业可选）：{restricted_count}/{stats_total_courses}"
          f"（{restricted_count/stats_total_courses:.1%}），其余默认其他专业学生都能选")
    print(f"官方推荐跨专业选修（课程名带*）：{recommended_count}/{stats_total_courses}"
          f"（{recommended_count/stats_total_courses:.1%}）")


if __name__ == "__main__":
    sys.exit(main())
