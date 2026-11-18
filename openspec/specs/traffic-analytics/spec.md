# traffic-analytics Specification

## Purpose
把网关与用户/模型数据聚合成控制台可用的流量分析视图，包括 KPI、趋势、模型 Token 分布、近期请求、系统概览与告警，支撑运营监控与容量决策。

## Requirements

### Requirement: Dashboard 聚合接口

系统 SHALL 提供 `GET /api/analytics/dashboard?range=today|7d|30d`，一次返回 KPI、趋势曲线、模型 Token 分布、近期请求、系统概览与未读告警数；不同时间范围 SHALL 返回不同的聚合粒度。

#### Scenario: 今日聚合
- **WHEN** 客户端请求 `range=today`
- **THEN** 返回今日总请求量、总 Token、成功率及其环比变化，趋势为按小时/15 分钟粒度的序列，模型分布之和为 100%

#### Scenario: 近 7 天/近 30 天聚合
- **WHEN** 客户端请求 `range=7d` 或 `range=30d`
- **THEN** 返回对应周期的聚合，趋势点数量与天数匹配，KPI 与环比按对应周期计算

#### Scenario: 非法时间范围
- **WHEN** 客户端提交不支持的时间范围
- **THEN** 返回 `400`，不返回其他范围的数据

### Requirement: KPI 与趋势

系统 SHALL 基于真实流量聚合计算总请求量、Token 使用量、成功率与环比变化，并提供 sparkline 数据；成功率 SHALL 为成功请求数除以总请求数（保留一位小数百分比）。

#### Scenario: 成功率计算
- **WHEN** 某周期内成功请求 1240 次、总请求 1250 次
- **THEN** 返回的成功率为 `99.2%` 等价数值，且四舍五入保留一位小数

#### Scenario: 种子基线复现原型
- **WHEN** 系统首次初始化为今日种子流量
- **THEN** Dashboard 今日 KPI 复现原型数值（总请求量 128,960、Token 使用量 1.24B、成功率 99.2%），趋势曲线与模型占比（40.2%/32.6%/18.1%/9.1%）与原型一致

### Requirement: 近期请求与系统概览

系统 SHALL 返回按时间倒序的近期请求（用户、模型、Token 数、状态、时间），以及用户总数、角色数量、接入模型数、系统运行时长。

#### Scenario: 近期请求
- **WHEN** 客户端请求 Dashboard 聚合
- **THEN** 返回至少 4 条近期请求，字段与原型表格列一致并按时间倒序

#### Scenario: 运行时长
- **WHEN** 系统已运行满 15 天（含种子启动时间）
- **THEN** 系统概览返回运行时长 15 天（向下取整到天）

### Requirement: 告警与通知

系统 SHALL 在配额使用达到阈值、配额超限、限流触发时生成告警；告警支持未读/已读状态和未读数统计，控制台顶栏通知徽标 SHALL 显示未读数。

#### Scenario: 配额超限告警
- **WHEN** 用户 Token 用量达到日/月配额的告警阈值或配额上限
- **THEN** 生成一条包含用户、周期、用量的告警，未读数增加

#### Scenario: 标记已读
- **WHEN** 管理员将某条告警标记为已读
- **THEN** 该告警不再出现在未读列表，顶栏未读数减一
