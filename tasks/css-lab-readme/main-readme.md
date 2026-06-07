# CSS Lab — 计算社会科学实验室

> Computational Social Science Lab | 公共管理 · 公地治理 · 计算传播学 · 社采媒体

CSS Lab 是一个面向计算社会科学研究的数据基础设施项目，覆盖公共政策、公地治理、平台治理、舆情分析等领域。通过自动化数据采集（Exa API）、结构化存储（Ostrom SES 框架）和智能检索（RAG），为实验室研究提供即用的数据资产和工具链。

## 项目矩阵

| 项目 | 仓库 | 数据量 | 说明 |
|------|------|--------|------|
| P01 政策数据库 | [css-lab-policy-db](https://github.com/Yuuqq/css-lab-policy-db) | 2,045 条 | 国内外政策文本结构化数据库 |
| P02 公地治理案例库 | [css-lab-commons-db](https://github.com/Yuuqq/css-lab-commons-db) | 6 类 × 10+ 案例 | Ostrom SES/IAD 框架数字化案例 |
| P03 平台治理 | [css-lab-platform-governance](https://github.com/css-lab-platform-governance) | 10+ 平台 | 社交媒体平台政策变迁时间线 |
| P04 RAG 智能体 | [css-lab-rag-agent](https://github.com/Yuuqq/css-lab-rag-agent) | TF-IDF 索引 + Flask | 政策文本智能检索系统 |
| P05 标注工具 | [css-lab-annotation-tool](https://github.com/Yuuqq/css-lab-annotation-tool) | 2,045 条标注 | 规则引擎 + LLM 标注管线 |
| P06 舆情分析 | [css-lab-sentiment-analysis](https://github.com/Yuuqq/css-lab-sentiment-analysis) | 7 个议题 | 社交媒体舆情数据集 |
| P07 可视化 | [css-lab-visualization](https://github.com/Yuuqq/css-lab-visualization) | HTML 仪表板 | 静态可视化仪表板 |
| P08 数据图谱 | [css-lab-data-atlas](https://github.com/Yuuqq/css-lab-data-atlas) | 60+ 资源 | 开放数据资源目录 |

## 快速开始

```bash
# 克隆全部项目
for repo in css-lab-policy-db css-lab-commons-db css-lab-platform-governance \
  css-lab-rag-agent css-lab-annotation-tool css-lab-sentiment-analysis \
  css-lab-visualization css-lab-data-atlas; do
  git clone https://github.com/Yuuqq/$repo.git
done

# 安装依赖
pip install -r css-lab-rag-agent/requirements.txt
pip install jieba flask exa-py

# 启动 RAG 搜索服务
cd css-lab-rag-agent
python app.py
# 访问 http://localhost:5000
```

## 数据采集方法

- **Exa API** — 全部政策文本通过 Exa 搜索 API 采集，限定 `gov.cn` 域名确保权威性
- **Ostrom SES 框架** — 公地治理案例基于 Elinor Ostrom 的社会生态系统框架结构化
- **平台政策归档** — 从微博、微信、抖音等 10+ 平台采集政策变迁时间线（2018-2026）
- **规则引擎标注** — 关键词匹配自动标注治理主题、政策情感、目标对象

## 研究方向

| 方向 | 关联项目 | 核心数据 |
|------|---------|---------|
| 公共管理 | P01, P05, P07 | 2,045 条政策文本 + 全量标注 |
| 公地治理 | P02 | 6 类公地资源 SES 案例 |
| 计算传播学 | P03, P06 | 10+ 平台政策 + 7 个舆情议题 |
| 社交媒体 | P03, P04, P06 | 平台治理规则 + RAG 检索 |

## 技术栈

- **数据采集**: Python, Exa API, jieba (中文分词)
- **数据存储**: JSON (结构化), TF-IDF 索引
- **检索**: Flask + TF-IDF 向量搜索
- **标注**: 规则引擎 + OpenAI-compatible LLM
- **可视化**: 纯 SVG 静态仪表板
- **AI Agent**: Google Jules (并行任务调度)

## 项目文档

详细的项目总览见 [CSS_LAB_OVERVIEW.md](https://github.com/Yuuqq/css-lab-policy-db/blob/main/CSS_LAB_OVERVIEW.md)。

## License

MIT
