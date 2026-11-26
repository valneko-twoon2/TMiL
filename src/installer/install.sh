#!/bin/sh
# TMiL をインストールする（Linux・x86_64）。管理者権限は要らない。
#
#   curl -fsSL https://github.com/valneko-twoon2/TMiL/releases/latest/download/install.sh | sh
#
# AppImage を ~/.local/bin/tmil に置き、アプリのメニューに登録する。
# 入れる前に、リリースの SHA256SUMS とハッシュが一致するかを確かめる。
#
#   バージョンを決める:   ... | TMIL_VERSION=0.2.0 sh
#   アンインストール:     ... | sh -s -- --uninstall
#   置き場所を変える:     TMIL_BIN_DIR=/path/to/bin
#   確かめるだけ:         TMIL_DRY_RUN=1（ダウンロードとハッシュの確認だけ行う）
set -eu

REPO="valneko-twoon2/TMiL"
BIN_DIR="${TMIL_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
TARGET="$BIN_DIR/tmil"
DESKTOP="$APP_DIR/tmil.desktop"

if [ -n "${TMIL_DOWNLOAD_BASE:-}" ]; then
  BASE="$TMIL_DOWNLOAD_BASE"
elif [ -n "${TMIL_VERSION:-}" ]; then
  BASE="https://github.com/$REPO/releases/download/v$TMIL_VERSION"
else
  BASE="https://github.com/$REPO/releases/latest/download"
fi

say() { printf '%s\n' "$*"; }
fail() {
  printf 'エラー: %s\n' "$*" >&2
  exit 1
}

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$TARGET" "$DESKTOP"
  say "TMiL をアンインストールしました。"
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64 | Linux-amd64) ;;
  *) fail "このスクリプトは Linux（x86_64）用です。Windows では install.ps1 を使ってください。" ;;
esac

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "curl か wget が必要です。"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    fail "sha256sum か shasum が必要です。"
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

say "TMiL のリリースを確かめています..."
download "$BASE/SHA256SUMS" "$TMP/SHA256SUMS" || fail "SHA256SUMS を取得できません: $BASE"

# 「ハッシュ  ファイル名」の行から AppImage を探す
LINE="$(grep -E '^[0-9a-f]{64} [ *][^ /]+_amd64\.AppImage$' "$TMP/SHA256SUMS" | head -n 1 || true)"
[ -n "$LINE" ] || fail "リリースに AppImage が見つかりません。"
EXPECTED="$(printf '%s' "$LINE" | cut -d ' ' -f 1)"
NAME="$(printf '%s' "$LINE" | sed -E 's/^[0-9a-f]{64} [ *]//')"

say "$NAME をダウンロードしています..."
download "$BASE/$NAME" "$TMP/$NAME" || fail "$NAME を取得できません。"
ACTUAL="$(sha256 "$TMP/$NAME")"
[ "$ACTUAL" = "$EXPECTED" ] || fail "ハッシュが一致しません（ダウンロードが壊れているか、書き換えられています）。"
say "ハッシュを確かめました。"

if [ "${TMIL_DRY_RUN:-}" = "1" ]; then
  say "確かめるだけなので、インストールはしません。"
  exit 0
fi

mkdir -p "$BIN_DIR" "$APP_DIR"
install -m 755 "$TMP/$NAME" "$TARGET"
cat >"$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=TMiL
Comment=軽量タスクマネージャー
Exec=$TARGET
Icon=utilities-system-monitor
Categories=Utility;System;Monitor;
Terminal=false
EOF

say "TMiL をインストールしました: $TARGET"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "（$BIN_DIR が PATH に入っていません。アプリのメニューから起動するか、PATH に足してください）" ;;
esac
say "AppImage の起動には FUSE（libfuse2）が要ることがあります。"
