# @weibaohui/dsh-git-server

[![DSH plugin](https://img.shields.io/badge/dsh-plugin-green)](https://github.com/topics/dsh-plugin)
[![npm version](https://img.shields.io/npm/v/@weibaohui/dsh-git-server)](https://www.npmjs.com/package/@weibaohui/dsh-git-server)

**Git 服务器插件**：内嵌 [ts-gogs](https://github.com/weibaohui/ts-gogs)（Gogs 的 TypeScript 平替），把一套**完整的自助 Git 服务**装进 dsh——HTTP clone/push、工单、PR、wiki、发版、标签、里程碑、webhook，全功能。网页侧全程是 dsh 原生界面（React + dsh 主题 token，零 iframe），账号可复用 user-management。

<video src="docs/demo-tour.webm" controls muted playsinline width="100%"></video>

## 核心功能

- **完整自助 Git 服务**：ts-gogs 作为受管子进程在独立端口跑起来，提供 HTTP smart 协议 clone/push、内核 API、webhook；仓库/工单/PR/wiki/发版/标签/里程碑一条龙
- **dsh 原生管理页**：侧栏底部「Git」入口进全屏页——仓库列表（建仓/删除/克隆地址）、仓库浏览多标签页（**文件**树+内容、**提交**历史、**分支**、**工单**、**PR**、**Wiki**、**发版**、**标签**、**里程碑**、**设置**）；React + dsh 主题 token（亮暗自动跟随）、zh/en 双语、经宿主同源 API 通信，零 iframe 零桥接
- **账号打通**：装了 [user-management](https://github.com/weibaohui/user-management) 即复用其用户名密码——git 凭据与原生页登录免另记一套账号，打开管理页即已登录态，dsh 管理员即 Git 管理员；未装 user-management 则用内置账户（管理员 `root`，密码在设置页可见可轮换）；网页注册关闭，账号只由 dsh 管理
- **一键启停 + 自愈**：启用/停用/端口/数据目录全在设置页；ts-gogs 崩溃 3 秒自动拉起，配置指纹变化 3 秒热生效（毫秒级停顿重启子进程）
- **身份链安全**：原生页所有操作按当前 dsh 登录用户身份执行——宿主解析会话 → 以本人身份铸个人令牌 → 进程内代理内核 API，每一步都是本人权限，无全局管理员透传
- **局域网 git**：默认监听 `0.0.0.0`，局域网内机器可直接 `git clone/push`（git remote 走该端口，HTTP Basic 认证）
- **数据自持**：数据目录 = 仓库 + 数据库 + 日志；升级插件后原样沿用，备份整个目录即备份全部

## 安装

```bash
dsh plugin --profile web add @weibaohui/dsh-git-server -w
```

装完重启 `dsh web` 即生效。首次启动自检运行时依赖（better-sqlite3 等），缺失时自动安装，无需手动 `npm install`。

## 使用

1. 打开 Web UI → **设置 → Git 服务器**，勾选**启用**并保存（默认监听 `0.0.0.0:3400`）
2. 侧栏底部点「**Git**」进全屏管理页：新建仓库（或导入已有），照常开发
3. `git clone/push` 走子进程端口，凭据用 dsh / user-management 的用户名密码（未装 user-management 则用内置管理员 `root` + 设置页展示的密码）：

   ```sh
   git clone http://127.0.0.1:3400/root/drill-repo.git
   cd drill-repo && git checkout -b feature && ... && git push origin feature
   ```

4. 仓库浏览、工单、PR、wiki、发版、标签、里程碑等日常操作全部在原生管理页完成

## 联系我 :飞书群

![link](https://foruda.gitee.com/images/1774880015525784725/4fd67005_77493.png "link")
