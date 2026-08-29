function buildCourseIndex(planData) {
  const index = new Map();
  for (const category of planData.categories) {
    for (const course of category.courses) {
      index.set(course.code, { ...course, categoryName: category.name });
    }
  }
  return index;
}

export function matchCourses(planData, transcriptCourses) {
  const index = buildCourseIndex(planData);
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

export function evaluatePlan(planData, transcriptCourses) {
  const { matched, unmatched } = matchCourses(planData, transcriptCourses);

  const categories = planData.categories.map(category => {
    const categoryMatchedCourses = matched.filter(c => c.categoryName === category.name);
    const achieved = sumCredits(categoryMatchedCourses);
    const required = category.required_credits;
    return {
      name: category.name,
      required,
      achieved,
      gap: Math.max(0, required - achieved),
      matchedCourses: categoryMatchedCourses,
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
