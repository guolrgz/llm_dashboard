# traffic-gateway Specification

## Purpose
提供 OpenAI 兼容的推理流量入口，完成 API Key 鉴权、配额/限流校验、上游转发或离线模拟、Token 计量与请求日志记录，是系统治理 Token 流量的核心链路。

## Requirements

### Requirement: OpenAI 兼容推理入口

系统 SHALL 提供 `POST /v1/chat/completions`，接受 OpenAI Chat Completions 风格请求体（至少 `model`、`messages`），支持非流式与 `stream=true` 流式响应，响应结构 SHALL 与 OpenAI 兼容。

#### Scenario: 非流式推理成功
- **WHEN** 客户端携带有效 API Key 提交包含 `messages` 的合法请求
- **THEN** 返回 `200`，响应含 `id`、`object`、`model`、`choices[].message.content` 与 `usage.prompt_tokens/completion_tokens/total_tokens`

#### Scenario: 流式推理
- **WHEN** 请求体 `stream=true`
- **THEN** 返回 `text/event-stream`，逐块输出 `data: {...}`，以 `data: [DONE]` 结束，并最终完成 Token 计量

#### Scenario: 请求体非法
- **WHEN** 请求体缺少 `messages`、`messages` 为空或字段类型非法
- **THEN** 返回 `400` 与可读错误信息，不产生 Token 消耗

#### Scenario: 模型不存在或已停用
- **WHEN** 请求指定不存在或已停用的模型
- **THEN** 返回 `404` 或 `400`，不调用上游

### Requirement: API Key 鉴权与拦截顺序

网关 SHALL 按“Key 有效性 → 用户状态 → 模型可用性 → 配额 → 限流 → 转发”的顺序处理请求；任一环节失败 SHALL 直接返回对应错误且不产生成功计量。

#### Scenario: 无 Key 或 Key 非法
- **WHEN** 请求缺少 `Authorization: Bearer` 或 Key 无效
- **THEN** 返回 `401`

#### Scenario: 停用用户持 Key 调用
- **WHEN** 持有有效 API Key 的用户已被停用
- **THEN** 返回 `403`

### Requirement: 上游转发与离线模拟

系统 SHALL 支持为模型渠道配置真实上游地址与密钥并转发请求；未配置可用上游时 SHALL 使用内置确定性模拟上游返回结果，保证系统在无外网、无真实模型时可运行。

#### Scenario: 配置上游后转发
- **WHEN** 模型渠道配置了可访问的上游地址
- **THEN** 网关把请求转发至上游并使用上游返回的 `usage` 计量

#### Scenario: 离线模拟上游
- **WHEN** 模型渠道未配置上游地址
- **THEN** 网关返回确定性模拟内容，Token 数按输入/输出文本长度可复现计算

### Requirement: Token 计量与请求日志

系统 SHALL 对每次被受理的推理请求记录：时间、用户、Key 前缀、模型、输入/输出/总 Token、状态、HTTP 状态码、耗时；失败或拒绝的请求 SHALL 以相应状态记录但不计入成功用量。

#### Scenario: 成功请求计量
- **WHEN** 一次推理成功返回
- **THEN** 请求日志新增一条 `status=success` 记录，用户日/月 Token 用量与模型小时聚合同步增加且数值一致

#### Scenario: 拒绝请求审计
- **WHEN** 请求因配额或限流被拒绝
- **THEN** 请求日志新增一条失败记录（状态区分 `quota_exceeded` / `rate_limited`），成功用量不变

#### Scenario: 请求日志查询
- **WHEN** 管理员按时间范围、用户、模型、状态筛选请求日志
- **THEN** 返回匹配的分页记录，按时间倒序

### Requirement: 运行健康检查

系统 SHALL 提供无需认证的 `GET /health`，返回服务状态、数据库状态、版本与启动时长。

#### Scenario: 健康检查
- **WHEN** 客户端调用 `GET /health`
- **THEN** 返回 `200`，包含 `status=ok`、数据库连通性、版本号与运行秒数
