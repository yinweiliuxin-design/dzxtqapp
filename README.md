# dzxtqapp · Silvio 电子小提琴 App

当前代码版本：**V29 可靠性版本**（`0.29.0`，2026-10-26，源码提交 `8168d027c520`）。

打开 [`index.html`](index.html) 查看 App 页面：首次引导与全部功能页截图、V29 改进项状态、功能一览、代码结构和 V12–V29 版本记录。

## 目录

| 路径 | 内容 |
|---|---|
| `index.html` | App 页面（当前代码版本） |
| `page/screens/` | 页面截图，由 V29 源码在本地预览中截取（390×844 手机视口；另有 1280×800 桌面） |
| `web-source/` | V29 完整网页源码：客户端 `dist/`、后台 `dist/admin.*`、服务端 `worker/`、数据库 `db/` 与 `drizzle/`、测试 `tests/`（266 个文件） |
| `android-source/` | V29 Android WebView 壳源码（13 个文件） |
| `SOURCE-MANIFEST.json` | 上述 279 个源文件的逐文件 SHA256 清单 |
| `docs/V29-交付说明.txt` | V29 原交付说明（R01–R14 状态、验证范围） |

## 本地运行

```sh
cd web-source
node scripts/build-worker.cjs   # 生成 dist/server/index.js，打包 149 个静态资源
node --test tests/*.test.mjs    # 709 项自动化测试
node scripts/preview.mjs        # http://127.0.0.1:18912
```

原说明要求 Node.js 24；本次在 Node.js 22.22 上构建与测试也全部通过。`dist/` 本身是静态 PWA，可直接用任意静态服务器打开 `web-source/dist/index.html`，此时社区、账号、在线课程目录和云进度接口不可用（`/api/*` 返回 404），其余本机功能和离线缓存可正常使用。

## 来源

源码复制自私有仓库 `yinweiliuxin-design/smartviolin` 的 `violinapp` 分支（提交 `ce224f0`）路径 `06-App软件/V29-可靠性版本/`，复制前已按 `SOURCE-MANIFEST.json` 核对 279 个文件的 SHA256，全部一致。

其他仓库中的 App 历史版本：

- `smartviolin` / `violinapp`：V19–V28.1 各版本完整源码
- `smartviolin` / `main`：V16 源码快照、V11 演示页
- `vio` / `main`：V15–V18 源码检查点（Base64 分卷，附恢复脚本）

## 尚未验证

没有实体手机、平板或真实小提琴的验收；调音准确度、延迟与功耗未实测。Google、Apple、Microsoft、邮箱登录未开通。Android 壳没有原生 BLE / MIDI 桥接。详见 `docs/V29-交付说明.txt`。
