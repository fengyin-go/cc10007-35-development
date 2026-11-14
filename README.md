# 数据分层建模工作台

离线版数仓分层建模工具，覆盖贴源层、明细层、汇总层、应用层的表结构设计、分区策略配置、质量规则编排与血缘关系管理，数据持久化到浏览器本地存储。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 贴源层建模 | `ods` | 贴源表 | 表编号、源表名称、目标表名 |
| 明细层建模 | `dwd` | 明细表 | 表编号、业务域、明细表名 |
| 汇总层建模 | `dws` | 汇总表 | 表编号、汇总主题、聚合维度 |
| 应用层发布 | `ads` | 应用数据集 | 数据集编号、业务应用、输出表名 |
| 数据源管理 | `source` | 数据源连接 | 连接编号、连接类型、接入地址 |
| 分区策略 | `partition` | 分区方案 | 方案编号、目标表名、分区字段 |
| 清洗加工 | `cleanse` | 清洗规则 | 规则编号、输入表名、目标表名 |
| 转换编排 | `transform` | 转换节点 | 节点编号、输入表名、输出表名 |
| 质量校验 | `quality` | 质量规则 | 规则编号、校验表名、目标字段 |
| 血缘追踪 | `lineage` | 血缘关系 | 关系编号、上游表名、下游表名 |
| 历史补数 | `backfill` | 补数任务 | 任务编号、目标表名、开始日期 |
| 元数据管理 | `schema` | 字段定义 | 字段编号、所属表名、字段名称 |
| 数据同步 | `datasync` | 同步链路 | 链路编号、源端连接、目标端连接 |
| 快照管理 | `snapshot` | 快照策略 | 策略编号、目标表名、快照周期 |
| 存储治理 | `govern` | 治理策略 | 策略编号、目标表名、治理类型 |
| 任务监控 | `monitor` | 监控配置 | 配置编号、关联任务、监控指标 |
| 变更审计 | `audit` | 审计记录 | 记录编号、操作表名、变更类型 |
| 编目检索 | `catalog` | 编目条目 / 目录护照 | 条目编号、数据集名称、所属分层、目录护照 |

## 目录护照（编目检索）

编目检索页在通用条目管理之上承载「目录护照」能力：catalog hit 可按 `name`、`layer`、`tag`、
`path` 钻取到一本护照，护照把三类证据与编目条目钉在一起。

- **field_rev 字段修订卡**：分「语义不兼容」（口径/类型不兼容，影响下游契约）与「label-only」
  （仅展示名/注释变化，码值与语义不变）两类，卡片带 schema 字段定义溯源编号。
- **ADS release**：记录应用层发布与 `output_contract`（含版本），契约随护照版本走。
- **QUAL ruling**：质量规则裁定，结论分通过 / 阻断 / 观察，带 quality 规则溯源编号。

一致性规则（实现集中在 `frontend/src/api/passport-service.ts`）：

1. **同笔签收**：CAT 的 issue / revise / retire 与 field_rev、ADS、QUAL 证据进同一本签收台账，
   逐行签收，全量签完护照才允许落库；签收台账单列在「签收台账」标签页。
2. **只追加不覆盖**：reissue（换发）只追加新护照，旧护照标记为「已换发」并与旧
   `output_contract` 并存；新版只登记本版新增的 field_rev 卡，不复制历史卡，历史按版本时间线回看。
3. **同 version_no 一个 root**：同一编目条目同 `version_no` 的并发签发，进程内互斥串行，
   只认第一个 root，后到请求直接拒绝。
4. **断点续签**：事务启动先落 running 台账（含护照草稿），签收中断后台账原样保留；恢复只续
   `signed=false` 的未签对象，草稿原样落库，禁止重新计算拼出半新半旧章。表单与停用操作都提供
   「模拟断点」开关，种子数据自带一本 running 台账可直接演练。
5. **以编目检索为主对象**：目录命中视图始终以 catalog 条目为主行，护照与断点台账作为附挂信息；
   护照详情抽屉内置 name/layer/tag/path 的「快照 vs 现值」核对。所有列表按稳定键排序，同条件
   多次检索结果顺序一致。

护照库使用独立 localStorage key（`data-layer-studio:catalog-passports`），与条目库
（`data-layer-studio:entries`）互不影响；护照页「重置护照库」只回滚护照数据。

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 目录护照是编目检索的独立子域：类型 `data/passport-types.ts`、种子 `data/passport-seed.ts`、
  持久化 `data/passport-store.ts`、事务与检索服务 `api/passport-service.ts`，页面组件在
  `views/catalog/components/`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断；护照事务同理，页面只调服务。
- 想回到初始数据：清掉浏览器里 `data-layer-studio:entries` 这一项，或调用 `resetModule(模块)`；
  护照库清 `data-layer-studio:catalog-passports`，或在编目检索页点「重置护照库」。

领域：数据工程
子方向：数仓与数据湖
