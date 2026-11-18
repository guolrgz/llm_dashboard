#!/usr/bin/env python3
"""Regenerate the local webfont subsets used by the 用户管理 page.

Usage:  python3 tools/users/make-fonts.py   (writes src/users/assets/fonts/*.woff2)
Requires network access to fonts.googleapis.com / fonts.gstatic.com.
The Google Fonts CSS2 `text=` API returns a variable-weight woff2 subset with exactly
the requested characters — no fonttools needed.
"""
import os
import re
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTDIR = os.path.join(ROOT, 'src/users/assets/fonts')

CJK = (
    "用户管理对系统进行新增删除修改停用和查询等操作状态全部启用角色管理员普通重置批量共条记录每页上下模型权限流量监控设置退出登录创建时间邮箱联系方式编辑编改开发者超级无"
    "请输入选择密码确认取消保存关闭返回首页更多详情暂无数据项成功失败提示删除吗已选跳至个人中心帮助文档关于版本更新导入导出筛选"
    "昵称电话手机性别备注部门职位名称编号排序日期开始结束至年月日时分秒今天昨天本周上月近天数据加载中暂权限拒绝继续操作危险警告信息错误"
    "正在处理请稍候结果为空符合条件应用重新加载刷新尾第前往总共显示"
    "超管运营审核员访客测试账户正常禁用锁定激活冻结要该此不可恢复"
    "批量启用停用已选择条记录"
    "一二三四五六七八九十第页新增成功保存成功删除成功操作成功确定要删除该用户吗此不可恢复"
    "LLM推理Token流量管理系统Dashboard用户管理模型管理权限管理流量监控系统设置退出登录"
    "新增编辑删除修改查询重置启用停用批量选择全选取消确定保存提交关闭返回清空应用筛选条件"
    "用户名邮箱手机联系方式昵称备注部门职位编号名称内容描述详情信息状态角色管理员普通用户超级开发者"
    "请输入密码账号登录提示警告信息成功失败错误操作确认数据页面当前暂无加载中处理请稍候系统繁忙网络异常重试刷新"
    "上一页下一页首页尾页跳至前往总共条每页显示第页已选项记录此不可恢复要吗"
    "导出导入下载上传搜索排序日期开始结束时间创建更新最近今天昨天本周本月全部范围"
    "的先了是在有和与或不可以请您我们他她它这那哪个吗呢吧很更最非常需要所有每任何其他该此该用将会能被把从到给对为把让做说看好想知"
    "该用户已被删除记录不存在权限不足无访问请稍后再试"
)
ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))
PUNCT = "、，。：；！？（）【】「」《》…—·～“”‘’￥"

def fetch_css(family: str, text: str) -> str:
    url = f"https://fonts.googleapis.com/css2?family={family}&text=" + urllib.parse.quote(text)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'})
    return urllib.request.urlopen(req, timeout=30).read().decode()

def download(css: str, out: str) -> None:
    m = re.search(r'url\((https://[^)]+)\)', css)
    if not m:
        raise SystemExit('no font url in CSS response: ' + css[:200])
    req = urllib.request.Request(m.group(1), headers={'User-Agent': 'Mozilla/5.0 Chrome/120.0'})
    data = urllib.request.urlopen(req, timeout=60).read()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(data)
    print(os.path.relpath(out, ROOT), len(data), 'bytes')

def main() -> None:
    chars = ''.join(dict.fromkeys(CJK + ASCII + PUNCT))
    download(fetch_css('Noto+Sans+SC:wght@100..900', chars), os.path.join(OUTDIR, 'noto-sans-sc-var.woff2'))
    download(fetch_css('Inter:wght@100..900', ASCII + PUNCT), os.path.join(OUTDIR, 'inter-var.woff2'))
    print('requested chars:', len(chars))

if __name__ == '__main__':
    main()
