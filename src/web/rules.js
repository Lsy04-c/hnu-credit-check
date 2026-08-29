function buildCourseIndex(planData, supplementaryCatalogs) {
  const index = new Map();
  for (const category of planData.categories) {
    for (const course of category.courses) {
      index.set(course.code, { ...course, categoryName: category.name });
    }
  }

  // 补充课表只用来给"开放池"类别（open_pool:true，方案原文没有枚举课程）提供可核实的课程编号，
  // 不会覆盖方案自己已经列出的课程（方案原文永远优先）。补充课表本身也只覆盖特定学期/范围，
  // 查不到不代表没修，只是没法自动核实——这个限制在 UI 层面展示，这里只管把能查到的接上。
  const openPoolCategoryNames = new Set(
    planData.categories.filter(c => c.open_pool).map(c => c.name)
  );
  for (const catalog of supplementaryCatalogs || []) {
    if (!openPoolCategoryNames.has(catalog.category)) continue;
    for (const course of catalog.courses) {
      if (index.has(course.code)) continue;
      index.set(course.code, { ...course, categoryName: catalog.category, fromSupplementary: true });
    }
  }

  return index;
}

export function matchCourses(planData, transcriptCourses, supplementaryCatalogs) {
  const index = buildCourseIndex(planData, supplementaryCatalogs);
  const seenCodes = new Set();
  const matched = [];
  const unmatched = [];

  for (const tc of transcriptCourses) {
    const planCourse = index.get(tc.code);
    if (!planCourse) {
      unmatched.push(tc);
      continue;
    }
    if (seenCodes.has(tc.code)) continue;
    seenCodes.add(tc.code);
    matched.push(planCourse);
  }

  return { matched, unmatched };
}

function sumCredits(courses) {
  return courses.reduce((total, c) => total + c.credits, 0);
}

function evaluateCategoryRules(category, categoryMatchedCourses) {
  return (category.rules || []).map(rule => {
    if (rule.type === 'min_credits_in_group') {
      const achieved = sumCredits(categoryMatchedCourses.filter(c => c.group === rule.group));
      return { ...rule, achieved, met: achieved >= rule.min };
    }
    if (rule.type === 'min_credits_in_groups') {
      const achieved = sumCredits(categoryMatchedCourses.filter(c => rule.groups.includes(c.group)));
      return { ...rule, achieved, met: achieved >= rule.min };
    }
    return { ...rule };
  });
}

// 一门课算不算"个别必须修读、缺了就要点名"：没有 group（平铺必修课），
// 或者虽然分了 group 但明确标了 mandatory:true（比如某个模块里的必选课）。
// 有 group 但没标 mandatory 的，属于"选修池"，缺了不点名，只看小组学分是否达标（已有 rules 覆盖）。
function isIndividuallyRequired(course) {
  return !course.group || course.mandatory === true;
}

// 通识选修这类没有枚举课程、但靠补充课表接上了 group（模块名）的类别，把匹配到的课程
// 按 group 分组求和，方便展示"四大模块各修了多少"，不需要方案里显式写 min_credits_in_groups 规则。
function buildGroupBreakdown(categoryMatchedCourses) {
  const grouped = categoryMatchedCourses.filter(c => c.group);
  if (grouped.length === 0) return null;
  const byGroup = new Map();
  for (const c of grouped) {
    byGroup.set(c.group, (byGroup.get(c.group) || 0) + c.credits);
  }
  return [...byGroup.entries()].map(([group, achieved]) => ({ group, achieved }));
}

export function evaluatePlan(planData, transcriptCourses, supplementaryCatalogs) {
  const { matched, unmatched } = matchCourses(planData, transcriptCourses, supplementaryCatalogs);

  const categories = planData.categories.map(category => {
    const categoryMatchedCourses = matched.filter(c => c.categoryName === category.name);
    const matchedCodes = new Set(categoryMatchedCourses.map(c => c.code));
    const achieved = sumCredits(categoryMatchedCourses);
    const required = category.required_credits;
    const missingRequiredCourses = category.courses.filter(
      c => isIndividuallyRequired(c) && !matchedCodes.has(c.code)
    );
    const usedSupplementary = categoryMatchedCourses.some(c => c.fromSupplementary);
    return {
      name: category.name,
      required,
      achieved,
      gap: Math.max(0, required - achieved),
      matchedCourses: categoryMatchedCourses,
      missingRequiredCourses,
      groupBreakdown: buildGroupBreakdown(categoryMatchedCourses),
      usedSupplementary,
      rules: evaluateCategoryRules(category, categoryMatchedCourses),
    };
  });

  return {
    totalRequired: planData.total_required_credits,
    totalAchieved: sumCredits(matched),
    categories,
    unmatchedCourses: unmatched,
  };
}
