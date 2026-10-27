# Silvio Android 实机测试包

用于 iQOO 11（V2243A）测试。包名 `com.smartvio.studio.test`，版本 `0.27.1` / `2701`，最低 Android 8.0（API 26），目标 API 35。运行页面保留访客使用；社区发布仍受原应用登录规则控制。

本项目是 Android 原生 WebView 容器，复用当前 SmartVio 网页应用。手机首次启动需要联网。它不是鸿蒙原生 HAP；当前没有实现原生 BLE / MIDI 桥接，不能将网页中的相关入口视为已完成手机硬件连接。已验证项目和仍需手机验证的项目见交付目录内的报告。

## 构建

在 Windows PowerShell 7 执行：

```powershell
pwsh -NoProfile -File .\build.ps1
```

默认使用已校验的便携工具链 `E:\codex\tools\android-iqoo11-20261025`，不需要 Gradle、Android Studio 或修改系统 PATH。可用 `-ToolchainRoot` 指定含相同目录结构的工具链目录。JavaScript 桥接测试需要 Node.js，可用 `-NodeExecutable` 指定可执行文件。官方来源及下载 SHA256 见交付目录内的 `toolchain-report.json`。

目录结构：

```text
android-iqoo11/
  AndroidManifest.xml
  src/                         Java 原生壳与独立策略
  res/                         图标、主题、网络安全配置
  assets/                      可选打包静态资源
  tests/                       可在 JVM 运行的策略和导出测试
  build.ps1                    编译、测试、签名、验证
```

脚本先运行 JVM 测试，再执行资源编译、Java 编译、DEX 打包、ZIP 对齐、签名和验签。所有临时文件位于 `E:\codex\Temp`。输出位于 `sites\artifacts\android-iqoo11-20261025`：

- `Silvio-V27-iQOO11-test.apk`
- `build-verification.json`
- `build-verification.txt`

脚本确认最终安装包的应用 ID、版本、SDK要求、必需 ZIP 条目、v2 签名和 ZIP 对齐，并记录源文件 SHA256、APK SHA256、签名证书 SHA256、权限清单和测试输出。相同源码可重复构建；构建时间戳可能使 APK 文件哈希不同。

## 测试签名

同一台电脑后续构建沿用持久测试签名，方便覆盖升级。密钥存于工作区 `.private\smartvio-android-test-signing`；随机密码以当前 Windows 用户的 DPAPI 加密保存，只通过子进程环境变量传给 Java 工具，不写入命令行或日志。

**不要将 `.private`、签名密钥或密码文件上传 GitHub。** 私密仓库也不存储这些文件。换电脑或用户前应由负责人单独安全保管签名资料；丢失签名后，重新生成的包不能直接覆盖旧包。测试签名不作为正式应用商店生产签名。

## 手机安装与验收

将 APK 发送到手机，在文件管理器点击安装；只在系统针对当前文件来源提示时允许安装。安装后启动 **Silvio 测试版**，按实际用途授予麦克风或摄像头权限。拒绝权限后其他页面仍应可用。

建议依次检查：访客进入 → 手机竖屏/横屏 → 曲库试听 → 练习播放/暂停 → 调音麦克风 → 录音开始/停止/回放 → 保存导出 → 本地文件导入 → 系统返回 → 断网提示和恢复联网。录音和视频请使用测试内容。

构建报告是软件静态及 JVM 验证，**不等同于手机安装、实机录音、蓝牙设备连接或延迟验证**。手机系统中的 Android System WebView 版本也会影响网页功能。
