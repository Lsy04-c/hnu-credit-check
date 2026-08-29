import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscriptText } from './parse.js';

test('解析 Tab 分隔的一行（课程编号/课程名/学分/成绩）', () => {
  const { courses, unparsedLines } = parseTranscriptText('CH04057\t无机化学（1）\t3\t85');
  assert.equal(courses.length, 1);
  assert.deepEqual(courses[0], { code: 'CH04057', name: '无机化学（1）', credits: 3 });
  assert.equal(unparsedLines.length, 0);
});

test('解析逗号分隔的一行', () => {
  const { courses } = parseTranscriptText('CH04058,无机化学（2）,2');
  assert.deepEqual(courses[0], { code: 'CH04058', name: '无机化学（2）', credits: 2 });
});

test('解析多空格对齐的一行', () => {
  const { courses } = parseTranscriptText('CH04059   有机化学（1）   2   良好');
  assert.deepEqual(courses[0], { code: 'CH04059', name: '有机化学（1）', credits: 2 });
});

test('解析多行，且没有课程编号的表头行会被跳过并记录', () => {
  const text = [
    '课程编号\t课程名称\t学分\t成绩',
    'CH04057\t无机化学（1）\t3\t85',
    'CH04058\t无机化学（2）\t2\t90',
  ].join('\n');
  const { courses, unparsedLines } = parseTranscriptText(text);
  assert.equal(courses.length, 2);
  assert.equal(unparsedLines.length, 1);
  assert.equal(unparsedLines[0], '课程编号\t课程名称\t学分\t成绩');
});

test('小数学分能正确解析', () => {
  const { courses } = parseTranscriptText('CH04065\t基础无机化学实验（1）\t1.5\t合格');
  assert.equal(courses[0].credits, 1.5);
});

test('空行会被忽略，不计入 unparsedLines', () => {
  const { courses, unparsedLines } = parseTranscriptText('CH04057\t无机化学（1）\t3\n\n\nCH04058\t无机化学（2）\t2');
  assert.equal(courses.length, 2);
  assert.equal(unparsedLines.length, 0);
});

test('提供已知编号清单时，按精确匹配识别编号（不依赖正则猜测格式）', () => {
  const validCodes = ['TB001MY24', 'ZJ001SX24AⅠ'];
  const text = 'TB001MY24\t马克思主义基本原理\t3\t90\nZJ001SX24AⅠ\t高等数学AⅠ\t5\t85';
  const { courses, unparsedLines } = parseTranscriptText(text, validCodes);
  assert.equal(courses.length, 2);
  assert.deepEqual(courses[0], { code: 'TB001MY24', name: '马克思主义基本原理', credits: 3 });
  assert.deepEqual(courses[1], { code: 'ZJ001SX24AⅠ', name: '高等数学AⅠ', credits: 5 });
  assert.equal(unparsedLines.length, 0);
});

test('已知编号清单里带内部空格的编号也能整体识别（Tab分隔时空格是编号的一部分）', () => {
  const validCodes = ['TB001TY24 Ⅱ'];
  const { courses } = parseTranscriptText('TB001TY24 Ⅱ\t体育Ⅱ\t1\t合格', validCodes);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, 'TB001TY24 Ⅱ');
});

test('已知编号清单里没有的编号，退回正则兜底照样解析成课程（是否真在方案里交给下游匹配判断，不在解析这步就丢掉）', () => {
  const validCodes = ['TB001MY24'];
  const { courses, unparsedLines } = parseTranscriptText('ZZ99999\t某门不认识的课\t2\t90', validCodes);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, 'ZZ99999');
  assert.equal(unparsedLines.length, 0);
});

test('识别教务系统"竖排导出"格式（一个字段一行，多条记录，含普通必修课）', () => {
  const validCodes = ['CH04021', 'CH04057'];
  const text = [
    '1', '2023-2024-1', 'CH04021', '化学实验室安全技术', '化学化工学院', '77', '1', '6', '3',
    '考试', '主修', '正常考试', '必修', '专业核心',
    '3', '2023-2024-1', 'CH04057', '无机化学（1）', '化学化工学院', '70', '3', '48', '2.7',
    '考试', '主修', '正常考试', '必修', '学类核心',
  ].join('\n');
  const { courses, unparsedLines } = parseTranscriptText(text, validCodes);
  assert.equal(courses.length, 2);
  assert.equal(courses[0].code, 'CH04021');
  assert.equal(courses[0].name, '化学实验室安全技术');
  assert.equal(courses[1].code, 'CH04057');
  assert.equal(courses[1].name, '无机化学（1）');
  assert.equal(unparsedLines.length, 0);
});

test('竖排导出格式：末尾带模块备注的记录（比如通识选修课带模块名）也能正常识别编号和名称', () => {
  const validCodes = ['GE16074'];
  const text = [
    '23', '2023-2024-2', 'GE16074', '西方人文经典导读', '中国语言文学学院', '77', '2', '33', '3',
    '考试', '主修', '正常考试', '选修', '通识选修', '历史与文明（20级及以后）、人文（17-19级）',
  ].join('\n');
  const { courses } = parseTranscriptText(text, validCodes, ['通识选修']);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, 'GE16074');
  assert.equal(courses[0].name, '西方人文经典导读');
  assert.equal(courses[0].category, '通识选修');
});

test('竖排导出格式：编号是否在培养方案里不影响解析阶段——即使不在清单里的编号也照样切出记录，交给下游匹配判断', () => {
  const text = [
    '1', '2023-2024-1', 'CH04021', '化学实验室安全技术', '化学化工学院', '77', '1', '6', '3',
    '考试', '主修', '正常考试', '必修', '专业核心',
    '43', '2024-2025-2', 'TB011MY24', '国家安全教育', '马克思主义学院', '85', '1', '4', '3.7',
    '考查', '主修', '正常考试', '选修', '其它',
  ].join('\n');
  // 不传 validCodes 也一样：竖排格式靠位置定位编号，不依赖已知编号清单
  const { courses, unparsedLines } = parseTranscriptText(text);
  assert.equal(courses.length, 2);
  assert.equal(courses[0].code, 'CH04021');
  assert.equal(courses[1].code, 'TB011MY24');
  assert.equal(unparsedLines.length, 0);
});
