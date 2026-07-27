#!/bin/bash
# 千问 Code 源码学习 — 手机访问启动脚本
# 用法: bash start-mobile-study.sh

PROJECT_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/谭家文/qwen-code-cli"
PORT=8080

# 获取局域网 IP
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo "╔══════════════════════════════════════════════╗"
echo "║   千问 Code 源码学习 — 手机端访问           ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  iPhone Safari 打开:                         ║"
echo "║  👉 http://${IP}:${PORT}              ║"
echo "║                                              ║"
echo "║  密码见下方输出                              ║"
echo "║  Ctrl+C 停止服务                             ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

export PATH="$HOME/.local/bin:$PATH"
exec code-server \
  --bind-addr "0.0.0.0:${PORT}" \
  --auth password \
  "$PROJECT_DIR"
