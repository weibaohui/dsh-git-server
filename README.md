# @weibaohui/dsh-git-server

dsh 插件 · Git 服务器：内嵌 [ts-gogs](https://github.com/weibaohui/ts-gogs)（Gogs 的 TypeScript 1:1 平替），独立端口跑一套完整的 Git 服务——HTTP clone/push、网页端、issue、PR、wiki、发版、webhook。崩溃自动拉起，配置热生效，可复用 [user-management](https://github.com/weibaohui/user-management) 插件的用户名密码。

## 功能

- **完整 Git 服务**：HTTP clone/push、网页端（仓库/issue/PR/wiki/发版/webhook/组织）、API v1
- **两种账号体系**（`authMode`）：
  - `gogs`（默认）：ts-gogs 本库账号 + 令牌；管理员 `root`，密码首次启动自动生成（设置页可见、可轮换），网页注册开放
  - `user-management`：git clone/push 与网页登录直接接受 user-management 插件的用户名密码（scrypt 口令跨仓复刻验证，映射为本库管理员）；TOTP 账号拒绝；用户库缺失自动回退 gogs 模式
- **子进程托管**：ts-gogs 作为受管子进程运行，崩溃 3 秒内自动拉起；插件卸载/停用时一并停止
- **设置页集成**：dsh 设置窗口新增「Git 服务器」section，状态/开关/端口/认证模式/管理员密码一目了然

## 安装

```bash
dsh plugin --profile web add /path/to/dsh-git-server
```

## 配置（settings.yaml 的 `dsh-git-server` 节 / 设置页可改，3s 热生效）

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 启用 Git 服务器 |
| `host` | `127.0.0.1` | 监听地址（`0.0.0.0` = 局域网可访问） |
| `port` | `3400` | 监听端口 |
| `dataDir` | `~/.dsh/dsh-git-server/data` | 仓库/数据库/日志目录（支持 `~`） |
| `authMode` | `gogs` | `gogs` 或 `user-management` |
| `adminPassword` | 自动生成 | 本库管理员 root 的密码 |

## 开发

```bash
npm run sync-gogs     # 从 ../ts-gogs 同步构建产物到 vendor/ts-gogs
npm run build:client  # 重新打包设置页 client bundle
npm test              # 合约测试（含真实子进程端到端：clone/push/UM 凭据）
```

### 依赖自动处理

`dsh plugin add` 对 `link:` 方式的插件不安装依赖；从 npm 安装时 pnpm 默认也会拦截 better-sqlite3 的构建脚本。本插件对此自愈：**每次启动前自检关键运行时依赖（better-sqlite3/ssh2/marked/ini/busboy/qrcode），缺失时自动在插件目录执行 `npm install --omit=dev`**（npm 默认执行安装脚本，better-sqlite3 直接取预编译产物），失败 30 秒后自动重试，状态里 `deps` 字段反映进度（ok / installing / failed）。也就是说：git clone 本仓库后直接 `dsh plugin add` 即可，无需手动 `npm install`。

注意：`vendor/ts-gogs` 的运行时依赖（better-sqlite3/ssh2 等）由本包的 `dependencies` 提供，`npm install` 时编译。

## 与 user-management 的密码兼容

`authMode: user-management` 时，插件把 user-management 的 `users.json`（`~/.dsh/user-management/users.json`）传给内嵌 ts-gogs，后者用同款 scrypt 参数（N=16384/r=8/p=1，keylen 32，salt+hex hash）验证用户名密码。判定结果带双层缓存（用户库按 mtime、凭据按哈希键，正 5 分钟/负 30 秒），disabled 账号拒绝，TOTP 账号明确拒绝，用户库缺失自动回退 gogs 账号模式。
