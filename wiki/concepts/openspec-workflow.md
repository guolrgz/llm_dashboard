---
title: OpenSpec 规格驱动工作流
source_files:
  - openspec/config.yaml
  - openspec/specs
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/proposal.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/design.md
  - openspec/changes/archive/2026-11-18-build-token-traffic-system/tasks.md
updated: 2026-11-18
tags: [concept, openspec, process]
---

# OpenSpec 规格驱动工作流

## 为什么用 OpenSpec

这个仓库不是“直接写代码”，而是按 **OpenSpec（spec-driven）** 流程交付：先把要做的系统写成可验收的规格（proposal + capability specs + design + tasks），再实现，最后归档并把增量规格合并为主规格。好处：

- **规格即验收标准**：每个 capability 的 `### Requirement` / `#### Scenario` 可直接映射到测试与 E2E 用例。
- **多角色并行有共同契约**：本次后端/前端/QA 并行开发，靠 `docs/api-contract.md` + capability specs 对齐。
- **知识可复用**：归档后的 `openspec/specs/` 是系统“应该做什么”的权威描述，和本 wiki 的“代码实际怎么做”互补。

## 目录与命令

```text
openspec/
├── config.yaml                     # schema: spec-driven
├── changes/archive/
│   └── 2026-11-18-build-token-traffic-system/
│       ├── proposal.md            # Why / What / Capabilities / Impact
│       ├── design.md              # 架构决策、数据模型、风险
│       ├── tasks.md               # 56 个可勾选任务（全部完成）
│       └── specs/<capability>/spec.md   # 7 份 delta spec（已归档）
└── specs/                          # 归档后合并的主规格（7 个 capability）
```

常用命令：

```bash
openspec status --change <name>          # 规划进度
openspec instructions apply --change <name>
openspec validate <name> --strict        # 规格校验
openspec archive <name> --yes            # 归档并合并 specs
openspec list --specs                    # 主规格目录
```

## 本次变更的 7 个 capability

| capability | 覆盖 |
|---|---|
| `auth-rbac` | 登录、JWT 会话、退出吊销、5 角色 17 权限、接口授权、前端守卫 |
| `user-management` | 用户增删改查、启停、批量、筛选分页、与概览一致 |
| `model-channel` | 模型渠道 CRUD、启停、权重与路由、概览模型数 |
| `api-key-quota` | Key 生命周期、配额优先级、RPM/TPM 限流、策略管理 |
| `traffic-gateway` | OpenAI 兼容入口、鉴权/拦截顺序、上游/模拟、计量日志、健康检查 |
| `traffic-analytics` | Dashboard 聚合、KPI/趋势/分布、近期请求/概览、告警 |
| `management-console` | 信息架构、真实数据接入、治理页面、响应式/可访问性 |

每个 capability 都有 3–5 条 Requirement 与对应 Scenario（WHEN/THEN），`openspec validate --strict` 通过。

## 实现与规格的对应

- `tasks.md` 共 56 个任务（10 组 + 归档 follow-up），实现阶段逐条勾选；任务描述里要求“如何验证”，因此每个任务都能对应 pytest 或浏览器检查。
- `design.md` 记录的关键决策现在都已在代码中落地：FastAPI + stdlib sqlite3、JWT 自实现、配额优先级、离线模拟上游、种子基线、前端 props 化图表等。见 [[overview]]。
- 实现完成后执行 `openspec archive --yes`：delta specs 合并进 `openspec/specs/<capability>/spec.md`，change 移入 `changes/archive/`。归档记录里能看到 30 条 requirement 被新增、0 删除。

## 后续如何发起新变更

1. 提出 proposal：说明 Why/What/Capabilities/Impact，明确受影响的既有 capability（用归档后的主规格路径）。
2. 生成 delta specs（ADDED/MODIFIED/REMOVED Requirements + Scenario）。
3. 写 design（架构/数据/风险/迁移）。
4. 拆 tasks（每条含验证方式）。
5. `openspec validate --strict` → 实现 → 勾选 tasks → `openspec archive`。
6. 更新本 wiki（ingest 新代码）与 `docs/api.md`。

## 坑与注意点

- **归档前必须全部任务完成**：`openspec archive` 会检查 tasks 勾选状态；半途归档会导致主规格与实现不一致。
- **MODIFIED requirement 要贴完整块**：只写部分内容会在归档时丢失细节。
- **delta spec 不要写 `## Purpose`**（新 capability 才需要；归档时会校验）。
- **主规格 ≠ wiki**：主规格描述“行为契约”，wiki 描述“代码实现与坑”；两者要同步更新，但不能互相替代。

## 相关页面

- [[modules/openspec]]、[[entities/openspec-change]]
- [[overview]]、[[concepts/testing-verification]]
- 代码映射：[[modules/backend]]、[[modules/frontend]]
