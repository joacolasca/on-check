#!/usr/bin/env bash
# Guarda la clave del agente en .env sin mostrarla en pantalla ni dejarla en el historial.
# Uso: bash scripts/guardar-clave.sh openrouter   (clave sk-or-…)
#      bash scripts/guardar-clave.sh anthropic    (clave sk-ant-…, es el valor por defecto)
set -euo pipefail
cd "$(dirname "$0")/.."
proveedor="${1:-anthropic}"
case "$proveedor" in
  openrouter) variable="OPENROUTER_API_KEY"; prefijo="sk-or-" ;;
  anthropic)  variable="ANTHROPIC_API_KEY";  prefijo="sk-ant-" ;;
  *) echo "Proveedor desconocido: $proveedor (usá openrouter o anthropic)." >&2; exit 1 ;;
esac
read -r -s -p "Pegá tu clave de $proveedor (empieza con $prefijo) y apretá Enter: " clave
echo
# Terminal puede agregar marcas invisibles al pegar (bracketed paste) y a veces se cuelan espacios o comillas.
clave="${clave//$'\e[200~'/}"; clave="${clave//$'\e[201~'/}"
clave="${clave//\[200~/}"; clave="${clave//\[201~/}"
clave="$(printf '%s' "$clave" | tr -cd '[:graph:]')"
clave="${clave//\"/}"; clave="${clave//\'/}"
if [[ "$clave" != "$prefijo"* ]]; then
  echo "Eso no parece una clave de $proveedor: tiene que empezar con $prefijo (lo que pegaste tiene ${#clave} caracteres). No guardé nada." >&2
  echo "Copiá la clave de nuevo desde la página, sin espacios, y probá otra vez." >&2
  exit 1
fi
touch .env
grep -v "^${variable}=" .env > .env.tmp || true
printf '%s=%s\n' "$variable" "$clave" >> .env.tmp
mv .env.tmp .env
chmod 600 .env
echo "Listo: la clave quedó en .env (que git ignora). Reiniciá 'pnpm dev' para que la tome."
