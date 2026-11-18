# api-key-quota Specification

## Purpose
签发与管理调用推理网关所需的 API Key，并通过 Token 配额与 RPM/TPM 限流策略约束每个 Key、用户和角色的流量消耗，防止超支与滥用。

## Requirements

### Requirement: API Key 生命周期

系统 SHALL 允许具备 `keys.manage` 权限的用户为指定用户创建、列出、吊销与轮换 API Key；明文 Key 仅在创建/轮换响应中出现一次，库存只保存哈希与前缀。

#### Scenario: 创建 API Key
- **WHEN** 管理员为某用户创建 API Key
- **THEN** 返回 `201`，响应包含完整明文 Key（`sk-` 前缀）与 Key ID，之后列表接口仅返回掩码/前缀

#### Scenario: 吊销 API Key
- **WHEN** 管理员吊销某个 API Key 后使用该明文 Key 调用推理网关
- **THEN** 返回 `401`，请求不被转发也不产生计费

#### Scenario: 不存在的 Key
- **WHEN** 使用格式合法但未签发的 Key 调用推理网关
- **THEN** 返回 `401`

### Requirement: Token 配额

系统 SHALL 为每个用户维护日配额与月配额（Token 数），并以下列顺序判定：用户级配额优先于角色默认配额；用量按自然日/自然月累计，来自真实网关请求的 Token 计量。

#### Scenario: 配额内请求放行
- **WHEN** 用户当日已用 Token 低于日配额，调用推理网关产生新的 Token 消耗
- **THEN** 请求成功，响应头包含当日剩余 Token 配额信息，用量原子累加

#### Scenario: 超出日配额
- **WHEN** 用户当日已用 Token 达到或超过日配额后继续调用推理网关
- **THEN** 返回 `429`，错误码说明配额超限，请求不产生上游调用与成功计费记录

#### Scenario: 配额恢复
- **WHEN** 进入新的自然日或自然月
- **THEN** 相应周期的已用量从零重新累计，配额重新可用

### Requirement: RPM/TPM 限流

系统 SHALL 对每个 API Key 实施每分钟请求数（RPM）与每分钟 Token 数（TPM）限制；超过限制 SHALL 立即拒绝，并返回 `Retry-After` 提示。

#### Scenario: RPM 超限
- **WHEN** 某 Key 在 60 秒窗口内请求次数超过其 RPM 限制
- **THEN** 后续请求返回 `429` 与 `Retry-After` 响应头，且不产生上游调用

#### Scenario: TPM 超限
- **WHEN** 某 Key 在 60 秒窗口内累计 Token 超过其 TPM 限制
- **THEN** 后续请求返回 `429` 与 `Retry-After` 响应头

### Requirement: 配额与限流策略管理

系统 SHALL 提供配额与限流策略的读取和更新能力；默认策略来自系统设置，可按用户覆盖；策略修改对后续请求立即生效。

#### Scenario: 更新用户配额
- **WHEN** 具备 `quota.manage` 权限的管理员修改某用户日配额为 100000
- **THEN** 返回 `200`，该用户下一次请求按新配额判定

#### Scenario: 读取 Key 用量
- **WHEN** 管理员查看某 API Key 详情
- **THEN** 返回该 Key 的 RPM/TPM、日/月配额、已用 Token、剩余量、最近使用时间
