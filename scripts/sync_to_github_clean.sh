#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ROOT="${SOURCE_ROOT}/AcusticaFauna-GitHub"

if [ ! -d "$TARGET_ROOT" ]; then
  echo "ERROR: no existe la carpeta destino: $TARGET_ROOT"
  echo "Crea o clona AcusticaFauna-GitHub primero, luego vuelve a ejecutar este script."
  exit 1
fi

if [ "$SOURCE_ROOT" = "$TARGET_ROOT" ]; then
  echo "ERROR: SOURCE_ROOT y TARGET_ROOT son iguales; se cancela para evitar sobrescrituras."
  exit 1
fi

EXCLUDES=(
  "--exclude=./.git"
  "--exclude=./AcusticaFauna-GitHub"
  "--exclude=./node_modules"
  "--exclude=./*/node_modules"
  "--exclude=node_modules"
  "--exclude=./dist"
  "--exclude=./*/dist"
  "--exclude=dist"
  "--exclude=./dist-ssr"
  "--exclude=./*/dist-ssr"
  "--exclude=dist-ssr"
  "--exclude=./.venv"
  "--exclude=./.venv-*"
  "--exclude=./venv"
  "--exclude=./env"
  "--exclude=./*/.venv"
  "--exclude=./*/.venv-*"
  "--exclude=./*/venv"
  "--exclude=./*/env"
  "--exclude=.venv"
  "--exclude=.venv-*"
  "--exclude=venv"
  "--exclude=env"
  "--exclude=./data"
  "--exclude=data"
  "--exclude=./dataset_curado"
  "--exclude=dataset_curado"
  "--exclude=./dataset_ranas-*"
  "--exclude=./segmentos entrenamiento-*"
  "--exclude=./wetransfer_*"
  "--exclude=./Articulos"
  "--exclude=./Birdnet"
  "--exclude=./ESC-50-master"
  "--exclude=./PROYECTOGIT"
  "--exclude=./pruebas de audio"
  "--exclude=./videos"
  "--exclude=./models"
  "--exclude=./*/models"
  "--exclude=models"
  "--exclude=./storage"
  "--exclude=./*/storage"
  "--exclude=storage"
  "--exclude=./outputs"
  "--exclude=./*/outputs"
  "--exclude=outputs"
  "--exclude=./ml_runs"
  "--exclude=./*/ml_runs"
  "--exclude=ml_runs"
  "--exclude=./tmp"
  "--exclude=./*/tmp"
  "--exclude=tmp"
  "--exclude=./.pytest_cache"
  "--exclude=./*/.pytest_cache"
  "--exclude=.pytest_cache"
  "--exclude=./__pycache__"
  "--exclude=./*/__pycache__"
  "--exclude=__pycache__"
  "--exclude=./*.tmp"
  "--exclude=*.tmp"
  "--exclude=./*.log"
  "--exclude=*.log"
  "--exclude=./*.local"
  "--exclude=*.local"
  "--exclude=./.env"
  "--exclude=./.env.*"
  "--exclude=./*.wav"
  "--exclude=*.wav"
  "--exclude=./*.flac"
  "--exclude=*.flac"
  "--exclude=./*.mp3"
  "--exclude=*.mp3"
  "--exclude=./*.ogg"
  "--exclude=*.ogg"
  "--exclude=./*.m4a"
  "--exclude=*.m4a"
  "--exclude=./*.model"
  "--exclude=*.model"
  "--exclude=./*.pt"
  "--exclude=*.pt"
  "--exclude=./*.pth"
  "--exclude=*.pth"
  "--exclude=./*.ckpt"
  "--exclude=*.ckpt"
  "--exclude=./*.onnx"
  "--exclude=*.onnx"
  "--exclude=./*.pkl"
  "--exclude=*.pkl"
  "--exclude=./.DS_Store"
  "--exclude=.DS_Store"
  "--exclude=./Thumbs.db"
  "--exclude=Thumbs.db"
)

echo "Origen:  $SOURCE_ROOT"
echo "Destino: $TARGET_ROOT"
echo
echo "Copiando archivos versionables. No se borrara nada en el origen ni en el destino."

if command -v tar >/dev/null 2>&1; then
  (
    cd "$SOURCE_ROOT"
    tar "${EXCLUDES[@]}" -cf - .
  ) | (
    cd "$TARGET_ROOT"
    tar -xf -
  )
elif command -v powershell.exe >/dev/null 2>&1; then
  SOURCE_ROOT_PS="$SOURCE_ROOT"
  TARGET_ROOT_PS="$TARGET_ROOT"
  if command -v cygpath >/dev/null 2>&1; then
    SOURCE_ROOT_PS="$(cygpath -w "$SOURCE_ROOT")"
    TARGET_ROOT_PS="$(cygpath -w "$TARGET_ROOT")"
  fi

  SYNC_SOURCE_ROOT="$SOURCE_ROOT_PS" SYNC_TARGET_ROOT="$TARGET_ROOT_PS" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
    $ErrorActionPreference = "Stop"
    $source = $env:SYNC_SOURCE_ROOT
    $target = $env:SYNC_TARGET_ROOT
    $skipDirs = @(
      ".git", "AcusticaFauna-GitHub", "node_modules", "dist", "dist-ssr",
      ".venv", ".venv-ml", "venv", "env", "data",
      "dataset_curado", "Articulos", "Birdnet", "ESC-50-master",
      "PROYECTOGIT", "pruebas de audio", "videos", "models", "storage",
      "outputs", "ml_runs", "tmp", ".pytest_cache", "__pycache__"
    )
    $skipExts = @(
      ".tmp", ".log", ".local", ".wav", ".flac", ".mp3", ".ogg", ".m4a",
      ".model", ".pt", ".pth", ".ckpt", ".onnx", ".pkl"
    )
    $skipFiles = @(".env", ".DS_Store", "Thumbs.db")

    function Test-SkipDir([string] $name) {
      return (
        $name -in $skipDirs -or
        $name -like "dataset_ranas-*" -or
        $name -like "segmentos entrenamiento-*" -or
        $name -like "wetransfer_*"
      )
    }

    function Copy-CleanTree([string] $current) {
      Get-ChildItem -LiteralPath $current -Force | ForEach-Object {
        $relative = [System.IO.Path]::GetRelativePath($source, $_.FullName)
        $destination = Join-Path $target $relative
        $name = $_.Name

        if ($_.PSIsContainer) {
          if (Test-SkipDir $name) { return }
          New-Item -ItemType Directory -Force -Path $destination | Out-Null
          Copy-CleanTree $_.FullName
          return
        }

        if ($name -in $skipFiles) { return }
        if ([System.IO.Path]::GetExtension($name).ToLowerInvariant() -in $skipExts) { return }
        if ($name -like ".env.*" -and $name -ne ".env.example") { return }

        $parent = Split-Path -Parent $destination
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
      }
    }

    Copy-CleanTree $source
  '
else
  echo "ERROR: no se encontro tar ni powershell.exe en PATH."
  exit 1
fi

if [ -f "$SOURCE_ROOT/.env.example" ]; then
  cp "$SOURCE_ROOT/.env.example" "$TARGET_ROOT/.env.example"
fi

echo
echo "Ejecutando preflight en AcusticaFauna-GitHub..."
(
  cd "$TARGET_ROOT"
  if command -v python >/dev/null 2>&1; then
    python scripts/preflight_github.py
  elif command -v py >/dev/null 2>&1; then
    py scripts/preflight_github.py
  else
    echo "ERROR: no se encontro Python para ejecutar scripts/preflight_github.py"
    exit 1
  fi
)

echo
echo "Listo. Revisa y publica desde el destino con:"
echo "  cd \"$TARGET_ROOT\""
echo "  git status"
echo "  git add ."
echo "  git commit -m \"Sync clean release\""
echo "  git push"
