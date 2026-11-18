"""Permission catalogue and the five seeded roles.

The permission keys are the contract between the API layer and the console:
routers declare one key via ``require_permission("users.manage")`` and the UI
uses the same keys to hide controls the current user cannot use.
"""

from __future__ import annotations

PERMISSIONS: list[dict[str, str]] = [
    # dashboard
    {"key": "dashboard.view", "group_key": "dashboard", "group_label": "仪表盘", "name": "查看仪表盘", "description": "查看 Dashboard 聚合数据与图表"},
    # users
    {"key": "users.view", "group_key": "users", "group_label": "用户管理", "name": "查看用户", "description": "查看用户列表与详情"},
    {"key": "users.manage", "group_key": "users", "group_label": "用户管理", "name": "管理用户", "description": "新增、编辑、启停与删除用户"},
    # rbac
    {"key": "rbac.view", "group_key": "rbac", "group_label": "角色权限", "name": "查看角色权限", "description": "查看角色、权限目录与授权关系"},
    {"key": "rbac.manage", "group_key": "rbac", "group_label": "角色权限", "name": "管理角色权限", "description": "修改角色权限绑定"},
    # models
    {"key": "models.view", "group_key": "models", "group_label": "模型管理", "name": "查看模型渠道", "description": "查看接入模型与上游配置"},
    {"key": "models.manage", "group_key": "models", "group_label": "模型管理", "name": "管理模型渠道", "description": "新增、编辑、启停与删除模型渠道"},
    # api keys
    {"key": "keys.view", "group_key": "keys", "group_label": "API Key", "name": "查看 API Key", "description": "查看 Key 列表与用量"},
    {"key": "keys.manage", "group_key": "keys", "group_label": "API Key", "name": "管理 API Key", "description": "签发、轮换与吊销 API Key"},
    # quota
    {"key": "quota.view", "group_key": "quota", "group_label": "配额限流", "name": "查看配额限流", "description": "查看 Token 配额与 RPM/TPM 策略"},
    {"key": "quota.manage", "group_key": "quota", "group_label": "配额限流", "name": "管理配额限流", "description": "调整 Token 配额与 RPM/TPM 策略"},
    # traffic
    {"key": "traffic.view", "group_key": "traffic", "group_label": "流量监控", "name": "查看流量", "description": "查看请求日志、限流事件与流量摘要"},
    {"key": "traffic.manage", "group_key": "traffic", "group_label": "流量监控", "name": "管理流量", "description": "清理/导出流量日志等管理动作"},
    # alerts
    {"key": "alerts.view", "group_key": "alerts", "group_label": "告警通知", "name": "查看告警", "description": "查看配额与限流告警"},
    {"key": "alerts.manage", "group_key": "alerts", "group_label": "告警通知", "name": "管理告警", "description": "标记告警已读、确认告警"},
    # settings
    {"key": "settings.view", "group_key": "settings", "group_label": "系统设置", "name": "查看系统设置", "description": "查看默认配额、限流与告警阈值"},
    {"key": "settings.manage", "group_key": "settings", "group_label": "系统设置", "name": "管理系统设置", "description": "修改默认配额、限流与告警阈值"},
]

ALL_PERMISSION_KEYS = [item["key"] for item in PERMISSIONS]

ROLES: list[dict] = [
    {
        "key": "super_admin",
        "name": "超级管理员",
        "description": "拥有系统全部权限，负责最高级别配置与授权",
        "is_super": 1,
        "permissions": ["*"],
    },
    {
        "key": "admin",
        "name": "管理员",
        "description": "负责用户、模型、Key、配额与系统设置的日常管理",
        "is_super": 0,
        "permissions": [
            "dashboard.view",
            "users.view",
            "users.manage",
            "rbac.view",
            "rbac.manage",
            "models.view",
            "models.manage",
            "keys.view",
            "keys.manage",
            "quota.view",
            "quota.manage",
            "traffic.view",
            "traffic.manage",
            "alerts.view",
            "alerts.manage",
            "settings.view",
            "settings.manage",
        ],
    },
    {
        "key": "operator",
        "name": "运维管理员",
        "description": "负责流量监控、限流处置与告警响应",
        "is_super": 0,
        "permissions": [
            "dashboard.view",
            "users.view",
            "models.view",
            "keys.view",
            "quota.view",
            "traffic.view",
            "traffic.manage",
            "alerts.view",
            "alerts.manage",
        ],
    },
    {
        "key": "developer",
        "name": "开发者",
        "description": "负责接入模型、创建 API Key 并查看自身流量",
        "is_super": 0,
        "permissions": [
            "dashboard.view",
            "models.view",
            "keys.view",
            "keys.manage",
            "quota.view",
            "traffic.view",
        ],
    },
    {
        "key": "viewer",
        "name": "普通用户",
        "description": "只读查看 Dashboard、用户与模型信息",
        "is_super": 0,
        "permissions": ["dashboard.view", "users.view", "models.view", "traffic.view"],
    },
]

ROLE_BY_KEY = {role["key"]: role for role in ROLES}
ROLE_KEY_BY_NAME = {role["name"]: role["key"] for role in ROLES}

# role names that may appear in the legacy users mock / design copy
ROLE_ALIASES = {
    "超级管理员": "super_admin",
    "管理员": "admin",
    "系统管理员": "admin",
    "运维管理员": "operator",
    "开发者": "developer",
    "普通用户": "viewer",
}


def all_permissions_for(role_key: str) -> list[str]:
    role = ROLE_BY_KEY.get(role_key)
    if role is None:
        return []
    if role["is_super"]:
        return ["*", *ALL_PERMISSION_KEYS]
    return list(role["permissions"])


def has_permission(permissions: list[str], key: str) -> bool:
    return "*" in permissions or key in permissions
