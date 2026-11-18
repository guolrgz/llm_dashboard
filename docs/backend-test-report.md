# 后端测试报告 — build-token-traffic-system

生成时间：2026-11-18T07:45:11.610Z  
命令：`cd backend && PYTHONPATH="$(pwd)/vendor:$(pwd)" python3 -m pytest tests/ -q`  
（pytest 使用临时 SQLite 库隔离，不会修改演示库 `backend/data/app.db`）

## 结果

✅ PASS

| passed | failed | errors | skipped | total | exit code |
| --- | --- | --- | --- | --- | --- |
| 86 | 0 | 0 | 0 | 86 | 0 |

pytest 汇总行：`86 passed, 1 warning in 47.04s`

## 覆盖测试文件

- `backend/tests/test_alerts.py`
- `backend/tests/test_analytics.py`
- `backend/tests/test_auth.py`
- `backend/tests/test_models_keys.py`
- `backend/tests/test_quota_settings.py`
- `backend/tests/test_rbac.py`
- `backend/tests/test_security.py`
- `backend/tests/test_smoke.py`
- `backend/tests/test_traffic.py`
- `backend/tests/test_users.py`

## 运行输出（尾部）

```text
........................................................................ [ 83%]
..............                                                           [100%]
=============================== warnings summary ===============================
vendor/fastapi/testclient.py:1
  /home/student/code/llm_dashboard/backend/vendor/fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
86 passed, 1 warning in 47.04s
```

完整日志：`tools/out/e2e/logs/pytest.log`
