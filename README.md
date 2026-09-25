# @weibaohui/dsh-git-server

[![DSH plugin](https://img.shields.io/badge/dsh-plugin-green)](https://github.com/topics/dsh-plugin)
[![npm version](https://img.shields.io/npm/v/@weibaohui/dsh-git-server)](https://www.npmjs.com/package/@weibaohui/dsh-git-server)

**Git 服务器插件**：把一套完整的自助 Git 服务装进 dsh——HTTP clone/push、工单、PR、wiki、发版、标签、里程碑、webhook 全功能，网页侧全程是 dsh 原生界面，账号可复用 user-management。

<video src="docs/demo-tour.webm" controls muted playsinline width="100%"></video>

## 核心功能

- **完整自助 Git 服务**：HTTP clone/push 开箱即用，仓库/工单/PR/wiki/发版/标签/里程碑一条龙，崩溃自动拉起
- **dsh 原生管理页**：侧栏底部「Git」进全屏页——建仓/删仓/克隆地址，仓库浏览多标签（文件树+内容、提交历史、分支、工单、PR、Wiki、发版、标签、里程碑、设置）；React + dsh 主题（亮暗自动跟随）、zh/en 双语
- **账号打通**：账户来源 = [user-management](https://github.com/weibaohui/user-management)（必装）——git 凭据与页面登录均走 user-management 校验，免另记一套账号；网页注册关闭，账号只由 dsh 管理
- **一键启停**：启用/停用/端口/数据目录全在设置页，改完即生效
- **局域网 git**：默认监听 `0.0.0.0`，局域网内机器可直接 `git clone/push`
- **数据自持**：数据目录 = 仓库 + 数据库 + 日志，备份整个目录即备份全部

## 安装

本插件依赖 [user-management](https://github.com/weibaohui/user-management) 提供登录与账户，必须先装：

```bash
dsh plugin --profile web add @weibaohui/user-management -w
dsh plugin --profile web add @weibaohui/dsh-git-server -w
```

装完重启 `dsh web` 即生效。

## 使用

1. 打开 Web UI → **设置 → Git 服务器**——**默认已启用**（监听 `0.0.0.0:3400`，无需勾选；要停用在设置页取消勾选），可在此改端口/数据目录/查看 `root` 密码
2. 侧栏底部点「**Git**」进全屏管理页：新建仓库（或导入已有），照常开发
3. `git clone/push` 走子进程端口，凭据用 user-management 的用户名密码：

   ```sh
   git clone http://127.0.0.1:3400/root/drill-repo.git
   cd drill-repo && git checkout -b feature && ... && git push origin feature
   ```

4. 仓库浏览、工单、PR、wiki、发版、标签、里程碑等日常操作全部在原生管理页完成

## 联系我 :飞书群

![link](https://foruda.gitee.com/images/1774880015525784725/4fd67005_77493.png "link")

## 版本兼容性

本插件与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的版本对应关系：

| 插件版本 | 适配 dsh 版本 | 备注 |
|---------|--------------|------|
| 0.1.4 | 0.1.7-rc.2 | 当前版本，已在 @deepseek-ai/dsh@0.1.7-rc.2 下验证运行 |
| 0.1.3 | 0.1.7-rc.2 | 已在 @deepseek-ai/dsh@0.1.7-rc.2 下验证运行 |

> **发版约定**：每次发布新版本时，请在上表追加一行，记录该插件版本实际验证所用的 `@deepseek-ai/dsh` 版本。`package.json` 的 `engines.dsh` 声明最低支持版本；本表记录实际验证版本，二者配合使用。
