import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluatePlan } from './rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planData = JSON.parse(readFileSync(path.join(__dirname, 'data/plans/plan_chem_qiangji_2022.json'), 'utf8'));

test('未在方案中找到的课程编号会被记录为未匹配，不静默丢弃', () => {
  const result = evaluatePlan(planData, [{ code: 'ZZ99999', name: '某跨院系选修课', credits: 2 }]);
  assert.equal(result.unmatchedCourses.length, 1);
  assert.equal(result.unmatchedCourses[0].code, 'ZZ99999');
});

test('通识必修类别按匹配到的课程学分求和，并算出缺口', () => {
  const transcript = [
    { code: 'GE01150', name: '毛泽东思想和中国特色社会主义理论体系概论', credits: 3 },
    { code: 'GE01185', name: '思想道德与法治', credits: 3 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '通识必修');
  assert.equal(category.achieved, 6);
  assert.equal(category.required, 30);
  assert.equal(category.gap, 24);
});

test('个性培养-特色课程规则：只修满必选课共7学分时未达标（要求9学分）', () => {
  const transcript = [
    { code: 'CH10044', name: '科学研究训练实践（1）', credits: 1 },
    { code: 'CH10045', name: '科学研究训练实践（2）', credits: 1 },
    { code: 'CH10046', name: '科学研究训练实践（3）', credits: 1 },
    { code: 'CH05077', name: '化学基础科学问题研讨', credits: 2 },
    { code: 'CH06058', name: '计算化学', credits: 2 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_group' && r.group === '特色课程');
  assert.equal(rule.achieved, 7);
  assert.equal(rule.met, false);
});

test('个性培养-特色课程规则：加修一门选修课凑满9学分后达标', () => {
  const transcript = [
    { code: 'CH10044', name: '科学研究训练实践（1）', credits: 1 },
    { code: 'CH10045', name: '科学研究训练实践（2）', credits: 1 },
    { code: 'CH10046', name: '科学研究训练实践（3）', credits: 1 },
    { code: 'CH05077', name: '化学基础科学问题研讨', credits: 2 },
    { code: 'CH06058', name: '计算化学', credits: 2 },
    { code: 'CH06106', name: '化学与生活', credits: 2 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_group' && r.group === '特色课程');
  assert.equal(rule.achieved, 9);
  assert.equal(rule.met, true);
});

test('个性培养-模块1至5规则：跨模块组合刚好凑够6学分即达标', () => {
  const transcript = [
    { code: 'CH06062', name: '化学前沿', credits: 2 },
    { code: 'CH06089', name: '药物化学', credits: 2 },
    { code: 'CH06102', name: '材料化学', credits: 2 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_groups');
  assert.equal(rule.achieved, 6);
  assert.equal(rule.met, true);
});

test('个性培养-模块1至5规则：差0.5学分未达标（边界情况）', () => {
  const transcript = [
    { code: 'CH06062', name: '化学前沿', credits: 2 },
    { code: 'CH06089', name: '药物化学', credits: 2 },
    { code: 'CH05072', name: '高分子化学实验', credits: 0.5 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_groups');
  assert.equal(rule.achieved, 4.5);
  assert.equal(rule.met, false);
});

test('同一门课程重复出现时学分只计一次，不会翻倍', () => {
  const transcript = [
    { code: 'CH04057', name: '无机化学（1）', credits: 3 },
    { code: 'CH04057', name: '无机化学（1）', credits: 3 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '学类核心');
  assert.equal(category.achieved, 3);
});

test('缺的必修课会按具体课程名单列出来，而不只是给个学分缺口数字', () => {
  const result = evaluatePlan(planData, []);
  const category = result.categories.find(c => c.name === '通识必修');
  const missingCodes = category.missingRequiredCourses.map(c => c.code);
  assert.ok(missingCodes.includes('GE01150'));
  assert.ok(missingCodes.includes('GE01185'));
});

test('已经修过的必修课不会出现在缺课名单里', () => {
  const result = evaluatePlan(planData, [
    { code: 'GE01150', name: '毛泽东思想和中国特色社会主义理论体系概论', credits: 3 },
  ]);
  const category = result.categories.find(c => c.name === '通识必修');
  const missingCodes = category.missingRequiredCourses.map(c => c.code);
  assert.ok(!missingCodes.includes('GE01150'));
});

test('选修池里的课程（有 group 但不是 mandatory）不会被列进缺课名单', () => {
  const result = evaluatePlan(planData, []);
  const category = result.categories.find(c => c.name === '个性培养');
  const missingCodes = category.missingRequiredCourses.map(c => c.code);
  // 模块1里的"化学前沿"是选修池成员，不是必选，不该被点名
  assert.ok(!missingCodes.includes('CH06062'));
  // 特色课程里的"科学研究训练实践（1）"是 mandatory:true，应该被点名
  assert.ok(missingCodes.includes('CH10044'));
});

test('开放池类别（open_pool:true）提供补充课表后，能真实核算出已修学分，不再永远是0', () => {
  const openPoolPlan = {
    total_required_credits: 10,
    categories: [
      { name: '通识选修', required_credits: 10, open_pool: true, courses: [], rules: [] },
    ],
  };
  const supplementary = [
    {
      category: '通识选修',
      courses: [
        { code: 'TW047SY24', name: '中国哲学简史', credits: 2, group: '中华文化与世界文明' },
        { code: 'TS013GS24M', name: '公司理财', credits: 2, group: '社会科学与现代社会' },
      ],
    },
  ];
  const transcript = [
    { code: 'TW047SY24', name: '中国哲学简史', credits: 2 },
    { code: 'TS013GS24M', name: '公司理财', credits: 2 },
  ];
  const result = evaluatePlan(openPoolPlan, transcript, supplementary);
  const category = result.categories.find(c => c.name === '通识选修');
  assert.equal(category.achieved, 4);
  assert.deepEqual(
    category.groupBreakdown.sort((a, b) => a.group.localeCompare(b.group)),
    [
      { group: '中华文化与世界文明', achieved: 2 },
      { group: '社会科学与现代社会', achieved: 2 },
    ].sort((a, b) => a.group.localeCompare(b.group))
  );
});

test('补充课表不会覆盖方案原文里已经枚举好的课程', () => {
  const supplementary = [
    { category: '通识必修', courses: [{ code: 'GE01150', name: '被补充课表冒名顶替的假课程', credits: 999 }] },
  ];
  // 通识必修 open_pool:false，补充课表不该对它生效
  const result = evaluatePlan(planData, [{ code: 'GE01150', name: '毛泽东思想和中国特色社会主义理论体系概论', credits: 3 }], supplementary);
  const category = result.categories.find(c => c.name === '通识必修');
  const matched = category.matchedCourses.find(c => c.code === 'GE01150');
  assert.equal(matched.credits, 3);
});

test('选修池课程会按模块列出方案原文里的全部可选课程，并标出学生已经修过哪些', () => {
  const result = evaluatePlan(planData, [{ code: 'CH06062', name: '化学前沿', credits: 2 }]);
  const category = result.categories.find(c => c.name === '个性培养');
  const module1 = category.electivePools.find(p => p.group === '模块1：专业提升');
  assert.ok(module1);
  assert.ok(module1.courses.length > 1);
  const taken = module1.courses.find(c => c.code === 'CH06062');
  const notTaken = module1.courses.find(c => c.code !== 'CH06062');
  assert.equal(taken.taken, true);
  assert.equal(notTaken.taken, false);
});

test('必选课程（mandatory:true）不会出现在选修池清单里', () => {
  const result = evaluatePlan(planData, []);
  const category = result.categories.find(c => c.name === '个性培养');
  const allElectiveCodes = category.electivePools.flatMap(p => p.courses.map(c => c.code));
  assert.ok(!allElectiveCodes.includes('CH10044')); // 特色课程里 mandatory:true 的必选课
});

test('编号课表查不到时，按课程名兜底匹配（比如老编号的成绩单条目），真实计入已修学分', () => {
  const openPoolPlan = {
    total_required_credits: 10,
    categories: [
      { name: '通识选修', required_credits: 10, open_pool: true, courses: [], rules: [] },
    ],
  };
  const nameCatalogs = [
    { category: '通识选修', courses: [{ name: '西方人文经典导读', module: '中华文化与世界文明', credits: 2 }] },
  ];
  // 老编号（GE16074），不在任何编号课表里，只能靠名字匹配
  const transcript = [{ code: 'GE16074', name: '西方人文经典导读', credits: 2 }];
  const result = evaluatePlan(openPoolPlan, transcript, [], nameCatalogs);
  const category = result.categories.find(c => c.name === '通识选修');
  assert.equal(category.achieved, 2);
  assert.equal(category.usedNameMatch, true);
  assert.equal(result.unmatchedCourses.length, 0);
});

test('按课程名匹配只对开放池类别生效，不会误伤方案原文已经枚举好的课程', () => {
  const nameCatalogs = [
    { category: '通识必修', courses: [{ name: '假冒的课', module: '随便', credits: 999 }] },
  ];
  const result = evaluatePlan(planData, [{ code: 'ZZ99999', name: '假冒的课', credits: 2 }], [], nameCatalogs);
  assert.equal(result.unmatchedCourses.length, 1); // 通识必修 open_pool:false，名字匹配不该对它生效
});

test('匹配顺序：名字优先，编号兜底——同一条记录名字和编号能各自查到不同结果时，以名字匹配为准', () => {
  const openPoolPlan = {
    total_required_credits: 10,
    categories: [
      { name: '通识选修', required_credits: 10, open_pool: true, courses: [], rules: [] },
    ],
  };
  const codeCatalogs = [
    {
      category: '通识选修',
      courses: [{ code: 'TW999XX24', name: '某门课的编号版信息', credits: 1, group: '艺术审美与表达沟通' }],
    },
  ];
  const nameCatalogs = [
    {
      category: '通识选修',
      courses: [{ name: '某门课的编号版信息', module: '中华文化与世界文明', credits: 2 }],
    },
  ];
  // 编号和名字都能各自匹配到，但学分/模块不一样，用来验证到底谁生效
  const transcript = [{ code: 'TW999XX24', name: '某门课的编号版信息', credits: 1 }];
  const result = evaluatePlan(openPoolPlan, transcript, codeCatalogs, nameCatalogs);
  const category = result.categories.find(c => c.name === '通识选修');
  assert.equal(category.achieved, 2); // 名字匹配那份的学分（2），不是编号匹配那份的（1）
  assert.equal(category.groupBreakdown[0].group, '中华文化与世界文明'); // 名字匹配那份的模块
});
