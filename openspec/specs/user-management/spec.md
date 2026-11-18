# user-management Specification

## Purpose
提供系统用户的全生命周期管理能力，包括查询、创建、编辑、启停、删除与批量操作，并保证用户数据的安全、唯一与可追溯。

## Requirements

### Requirement: 用户列表查询

系统 SHALL 提供分页用户列表，支持按用户名/用户 ID/邮箱关键字搜索，按状态和角色筛选，并返回总数与每页数据。

#### Scenario: 分页查询
- **WHEN** 具备 `users.view` 权限的用户调用 `GET /api/users?page=1&pageSize=10`
- **THEN** 返回 `200`，包含 `items`、`total`、`page`、`pageSize`，`items` 每项含用户名、角色、邮箱、创建时间、状态，且不含密码哈希

#### Scenario: 关键字与状态筛选
- **WHEN** 调用 `GET /api/users?keyword=alice&status=enabled`
- **THEN** 返回结果仅包含匹配关键字且状态为启用的用户

#### Scenario: 无查看权限
- **WHEN** 不具备 `users.view` 权限的用户调用用户列表接口
- **THEN** 返回 `403`

### Requirement: 用户增删改

系统 SHALL 支持创建、编辑、删除用户；用户名与用户 ID 必须唯一；密码不得以明文返回；删除用户时 SHALL 同时吊销其 API Key 并清理其登录会话。

#### Scenario: 创建用户
- **WHEN** 具备 `users.manage` 权限的用户提交唯一用户名、密码、角色、邮箱创建用户
- **THEN** 返回 `201`，用户可在列表中被搜到，且响应中不含密码明文

#### Scenario: 用户名重复
- **WHEN** 创建或编辑用户时提交已存在的用户名
- **THEN** 返回 `409`，用户数据不被写入

#### Scenario: 删除用户
- **WHEN** 管理员删除一个存在且非当前登录用户的账号
- **THEN** 返回 `204`，该用户从列表消失、其 API Key 失效，且不能再用原账号登录

#### Scenario: 禁止删除自己或最后一个超级管理员
- **WHEN** 管理员尝试删除自己，或删除后系统将不再有可用的超级管理员
- **THEN** 返回 `400` 或 `409`，删除不生效

### Requirement: 用户启停与批量操作

系统 SHALL 支持单个与批量启用/停用用户，以及批量删除；停用用户 SHALL 无法登录且其 API Key 不可用于推理。

#### Scenario: 停用用户
- **WHEN** 管理员停用一个用户
- **THEN** 该用户在列表显示为停用，且登录与 API Key 鉴权均被拒绝

#### Scenario: 批量删除
- **WHEN** 管理员提交多个用户 ID 执行批量删除
- **THEN** 返回成功，实际删除数量与提交的有效 ID 数量一致

### Requirement: 用户数据与概览一致

系统 SHALL 在种子数据首次初始化时创建 128 个用户（前 48 个与用户管理设计稿一致），使系统概览的“用户总数”与用户列表总数一致。

#### Scenario: 概览用户总数
- **WHEN** 客户端读取 Dashboard 系统概览
- **THEN** 用户总数等于用户列表接口返回的 `total`
