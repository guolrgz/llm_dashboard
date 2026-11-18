# auth-rbac Specification

## Purpose
为系统提供账号登录、令牌会话、权限目录与角色授权能力，使所有管理接口和推理入口都处于可验证的身份与权限边界内。

## Requirements

### Requirement: 管理员登录

系统 SHALL 提供账号密码登录接口，校验成功后返回访问令牌和当前用户信息；密码必须以不可逆哈希存储，任何响应不得返回密码哈希。

#### Scenario: 正确凭据登录成功
- **WHEN** 客户端以种子管理员账号 `admin` 和正确密码调用 `POST /api/auth/login`
- **THEN** 返回 `200`，响应包含 `token`、`user`（id、用户名、昵称、角色、权限列表），且 `user` 中不含密码或哈希字段

#### Scenario: 错误凭据被拒绝
- **WHEN** 客户端以错误密码或不存在用户名调用 `POST /api/auth/login`
- **THEN** 返回 `401`，响应体包含统一错误码与可读错误信息

#### Scenario: 停用账号被拒绝
- **WHEN** 已停用用户使用正确密码登录
- **THEN** 返回 `403`，且不签发令牌

### Requirement: 令牌会话

系统 SHALL 使用带过期时间的签名令牌标识登录会话，管理接口通过 `Authorization: Bearer <token>` 识别当前用户；令牌过期、被篡改或已退出时 SHALL 返回 `401`。

#### Scenario: 有效令牌访问当前用户信息
- **WHEN** 客户端携带有效令牌调用 `GET /api/auth/me`
- **THEN** 返回 `200`，响应包含当前用户资料、角色和其生效权限列表

#### Scenario: 无令牌或令牌无效
- **WHEN** 客户端不携带令牌、令牌签名错误或令牌已过期访问受保护接口
- **THEN** 返回 `401`，且响应不泄露任何业务数据

#### Scenario: 退出登录后令牌失效
- **WHEN** 用户登录后调用 `POST /api/auth/logout` 并继续使用旧令牌访问受保护接口
- **THEN** 旧令牌返回 `401`，用户必须重新登录

### Requirement: 权限目录与角色

系统 SHALL 内置权限目录与 5 个角色；角色通过权限集合授权，用户通过角色获得权限；角色-权限绑定可由具备 `rbac.manage` 权限的用户修改。

#### Scenario: 读取角色与权限
- **WHEN** 已登录且具备 `rbac.view` 权限的用户调用 `GET /api/roles` 与 `GET /api/permissions`
- **THEN** 返回 `200`，角色数量为 5，每个角色包含其权限键列表，权限目录包含分组与中文名称

#### Scenario: 修改角色权限
- **WHEN** 具备 `rbac.manage` 权限的用户调用 `PUT /api/roles/{id}/permissions` 提交合法权限键集合
- **THEN** 返回 `200`，重新读取该角色时权限集合与提交一致，且受影响用户的下一次请求立即按新权限判定

#### Scenario: 无权限修改角色
- **WHEN** 不具备 `rbac.manage` 权限的用户尝试修改角色权限
- **THEN** 返回 `403`，角色权限保持不变

### Requirement: 接口级授权

除 `POST /api/auth/login`、`GET /health` 与推理入口 `/v1/*` 外，所有接口 SHALL 要求认证；接口 SHALL 按声明的权限键校验，越权请求返回 `403`。超级管理员角色 SHALL 拥有全部权限。

#### Scenario: 未认证访问管理接口
- **WHEN** 未登录客户端调用 `GET /api/users`
- **THEN** 返回 `401`，不返回用户数据

#### Scenario: 已认证但权限不足
- **WHEN** 仅具备 `dashboard.view` 权限的用户调用 `POST /api/users` 创建用户
- **THEN** 返回 `403`，用户数据未被创建

#### Scenario: 超级管理员放行
- **WHEN** 以超级管理员登录并调用任意受权限保护的管理接口
- **THEN** 返回成功，不因缺少单独权限键被拒绝

### Requirement: 控制台登录守卫

控制台 SHALL 在未登录时把页面导航重定向到登录页；登录成功后回到目标页；退出登录后清空本地令牌并回到登录页。

#### Scenario: 未登录访问控制台
- **WHEN** 浏览器无有效登录态直接打开控制台任意业务路由
- **THEN** 显示登录页而不是业务页面内容

#### Scenario: 登录后进入控制台
- **WHEN** 用户在登录页提交正确账号密码
- **THEN** 跳转到 Dashboard，并可在侧栏看到当前用户名
