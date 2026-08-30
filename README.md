# 培养方案学分自助核查工具

化学（强基计划）本科培养方案学分自助核查，纯前端静态网页，浏览器本地计算，不上传、不存储任何学生数据。

## 使用方法

1. 打开 `src/web/index.html`（或部署后的网址）
2. 登录教务系统，打开"已修课程"页面，框选表格并复制
3. 粘贴到网页文本框，点击"核算学分"
4. 查看各类别学分缺口、特殊规则（如"特色课程满9学分""模块1-5至少6学分"）达标情况

## 本地开发

```bash
cd src/web
node --test          # 跑单元测试
python3 -m http.server 8000    # 本地预览，浏览器打开 http://localhost:8000
```

## 全校专业选修课浏览

`src/web/browse.html` 是独立于学分核算之外的浏览页面，把全校专业培养方案里的"专业选修"课程按校区（南校区/北校区/科创港）分类，再按学分、考核方式（考试/考查）二级筛选。数据由 `scripts/build_elective_browse.py` 从 `data/plans/*.json` 和原始 PDF 生成到 `src/web/data/elective_browse.json`；校区归属见 `src/web/data/campus_map.json`。修改培养方案数据后需重新运行该脚本。

## 目录结构

- `data/`：培养方案原始 PDF 与人工转录的结构化数据（权威来源）
- `docs/`：设计方案与实现计划
- `src/web/`：静态网页源码（parse.js 解析、rules.js 核算引擎、app.js 页面逻辑、browse.js 全校专业选修课浏览页逻辑）
- `scripts/build_elective_browse.py`：生成全校专业选修课浏览数据

## 当前范围与后续规划

v1 只支持化学（强基计划）2022版培养方案，仅覆盖"化学专业端到端 MVP"。培养方案数据扩展（自提交/多专业）、通识课表知识库、选课推荐引擎等规划见 `docs/设计方案.md`。
