#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

is_windows_gitbash() {
  case "${MSYSTEM:-}" in
    MINGW*|MSYS*|UCRT*) return 0 ;;
  esac

  case "${OSTYPE:-}" in
    msys*|cygwin*) return 0 ;;
  esac

  uname -s 2>/dev/null | grep -qiE "mingw|msys|cygwin"
}

warn_path_if_needed() {
  local root_path="$ROOT"
  local root_len="${#root_path}"

  if [[ "$root_path" == *OneDrive* ]]; then
    echo "WARNING: el proyecto esta dentro de OneDrive."
    echo "Las dependencias ML pueden fallar por sincronizacion y rutas largas."
    echo "Ruta recomendada: C:\\AcusticaFauna o F:\\AcusticaFauna"
    if [ "${ACUSTICAFAUNA_ALLOW_ONEDRIVE:-0}" != "1" ]; then
      read -r -p "Se recomienda instalar en C:\\AcusticaFauna. Deseas continuar de todas formas? [y/N] " answer
      case "$answer" in
        y|Y|yes|YES) ;;
        *) echo "Instalacion cancelada. Mueve el repo a C:\\AcusticaFauna o F:\\AcusticaFauna."; exit 1 ;;
      esac
    fi
  fi

  if [ "$root_len" -gt 80 ]; then
    echo "WARNING: la ruta del proyecto es larga (${root_len} caracteres)."
    echo "Esto puede romper instalaciones ML en Windows."
    echo "Ruta recomendada: C:\\AcusticaFauna o F:\\AcusticaFauna"
  fi
}

warn_python_if_needed() {
  local version
  version="$(python - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"
  local major="${version%%.*}"
  local minor="${version#*.}"

  if [ "$major" -gt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -ge 13 ]; }; then
    echo "WARNING: Python 3.13 detectado. Para ML se recomienda Python 3.11."
    if [ "${ACUSTICAFAUNA_ALLOW_PYTHON_313:-0}" != "1" ]; then
      read -r -p "Deseas continuar de todas formas? [y/N] " answer
      case "$answer" in
        y|Y|yes|YES) ;;
        *) echo "Instalacion cancelada. Instala Python 3.11 o define ACUSTICAFAUNA_ALLOW_PYTHON_313=1."; exit 1 ;;
      esac
    fi
  fi
}

venv_python() {
  local venv_dir="$1"
  if is_windows_gitbash; then
    if [ -x "$venv_dir/Scripts/python.exe" ]; then
      printf '%s\n' "$venv_dir/Scripts/python.exe"
      return 0
    fi
    return 1
  else
    if [ -x "$venv_dir/bin/python" ]; then
      printf '%s\n' "$venv_dir/bin/python"
      return 0
    fi
  fi

  return 1
}

venv_pip() {
  local venv_dir="$1"
  if is_windows_gitbash; then
    if [ -x "$venv_dir/Scripts/pip.exe" ]; then
      printf '%s\n' "$venv_dir/Scripts/pip.exe"
      return 0
    fi
    return 1
  fi

  if [ -x "$venv_dir/bin/pip" ]; then
    printf '%s\n' "$venv_dir/bin/pip"
    return 0
  fi

  return 1
}

ensure_venv() {
  local venv_dir="$1"
  local label="$2"

  if [ ! -d "$venv_dir" ]; then
    echo "Creando venv $label en $venv_dir"
    if ! python -m venv "$venv_dir"; then
      echo "ERROR: no se pudo crear el venv $label en $venv_dir"
      if [ "$label" = "ML" ]; then
        echo "Causa comun en Windows: repo dentro de OneDrive o ruta demasiado larga."
        echo "Ruta recomendada: C:\\AcusticaFauna o F:\\AcusticaFauna"
        echo "Python recomendado para ML: 3.11"
      fi
      exit 1
    fi
  fi

  if ! venv_python "$venv_dir" >/dev/null; then
    echo "ERROR: el venv $label existe pero esta incompleto: $venv_dir"
    echo "No se encontro Python dentro del venv."
    if is_windows_gitbash; then
      echo "En Windows Git Bash se esperaba: $venv_dir/Scripts/python.exe"
    else
      echo "En Linux/macOS se esperaba: $venv_dir/bin/python"
    fi
    echo "Solucion: mueve el repo a C:\\AcusticaFauna o F:\\AcusticaFauna y vuelve a ejecutar setup."
    exit 1
  fi

  if ! venv_pip "$venv_dir" >/dev/null; then
    echo "ERROR: el venv $label existe pero esta incompleto: $venv_dir"
    echo "No se encontro pip dentro del venv."
    exit 1
  fi
}

install_requirements() {
  local venv_dir="$1"
  local requirements="$2"
  local label="$3"
  local python_exe
  local pip_exe

  python_exe="$(venv_python "$venv_dir")" || {
    echo "ERROR: el venv $label quedo incompleto: $venv_dir"
    exit 1
  }
  pip_exe="$(venv_pip "$venv_dir")" || {
    echo "ERROR: el venv $label quedo incompleto: $venv_dir"
    exit 1
  }

  echo "Instalando dependencias de $label con $python_exe (pip: $pip_exe)"
  "$python_exe" -m pip install -U pip
  if ! "$python_exe" -m pip install -r "$requirements"; then
    echo "ERROR: fallo la instalacion de dependencias de $label."
    if [ "$label" = "ML" ]; then
      echo "El venv ML puede haber quedado incompleto: $venv_dir"
      echo "Causa comun en Windows: repo dentro de OneDrive o ruta demasiado larga."
      echo "Ruta recomendada: C:\\AcusticaFauna o F:\\AcusticaFauna"
      echo "Python recomendado para ML: 3.11"
    fi
    exit 1
  fi
}

warn_path_if_needed

if ! command -v python >/dev/null 2>&1; then
  echo "ERROR: no se encontro Python en PATH."
  echo "Instala Python 3.11 y vuelve a ejecutar setup."
  exit 1
fi

warn_python_if_needed

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

python scripts/create_local_dirs.py

BACKEND="$ROOT/acusticafauna-General/acusticafauna-Back/backend"
ML="$ROOT/acusticafauna-ML"
FRONTEND="$ROOT/acusticafauna-General/acusticafauna-frontend"
BACKEND_VENV="$BACKEND/.venv-backend"
ML_VENV="$ML/.venv-ml"

ensure_venv "$BACKEND_VENV" "Backend"
install_requirements "$BACKEND_VENV" "$BACKEND/requirements.txt" "Backend"

ensure_venv "$ML_VENV" "ML"
install_requirements "$ML_VENV" "$ML/requirements-ml.txt" "ML"

cd "$FRONTEND"
npm install
cd "$ROOT"
python scripts/check_environment.py
