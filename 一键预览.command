#!/bin/sh
# macOS 双击运行；Linux 可在终端执行 ./一键预览.command
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 24 LTS：https://nodejs.org/"
  exit 1
fi
exec node start-preview.mjs "$@"
