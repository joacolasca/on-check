#!/usr/bin/env bash
# Gas de las wallets de demo en Base Sepolia (solo testnet).
#   bash scripts/eth-de-demo.sh            → muestra el saldo de cada wallet
#   bash scripts/eth-de-demo.sh repartir   → manda un poco de ETH desde la wallet admin a las que firman transacciones
# Lee las claves de .env (o de ENV_FILE) y nunca las imprime.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env}" # para las wallets propias: ENV_FILE=.env.wallets-propias
set -a; source "$ENV_FILE"; set +a
RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
POR_WALLET="${POR_WALLET:-0.003}" # ETH para cada wallet que firma; sobra para toda la demo

if [[ "$(cast chain-id --rpc-url "$RPC")" != "84532" ]]; then
  echo "El RPC no es Base Sepolia (chain id 84532). No hago nada." >&2; exit 1
fi

declare -a ROLES=(DEPLOYER ORIGINADOR ORACULO INVERSOR1 INVERSOR2 PYME)
dir() { cast wallet address --private-key "$(printenv "$1_PRIVATE_KEY")"; }

mostrar() {
  printf '%-12s %-44s %s\n' "Rol" "Dirección" "ETH"
  for r in "${ROLES[@]}"; do
    a="$(dir "$r")"; printf '%-12s %-44s %s\n' "$r" "$a" "$(cast balance "$a" --rpc-url "$RPC" --ether)"
  done
}

if [[ "${1:-}" == "repartir" ]]; then
  saldo="$(cast balance "$(dir DEPLOYER)" --rpc-url "$RPC" --ether)"
  echo "Saldo de la wallet admin: $saldo ETH"
  # Cuántas wallets necesitan gas y cuánto hace falta en total (más una reserva para el gas del deploy).
  pendientes=0
  for r in ORIGINADOR ORACULO INVERSOR1 INVERSOR2; do
    [[ "$(cast balance "$(dir "$r")" --rpc-url "$RPC")" == "0" ]] && pendientes=$((pendientes + 1))
  done
  necesario="$(( pendientes * $(cast to-wei "$POR_WALLET") + $(cast to-wei 0.005) ))"
  actual="$(cast balance "$(dir DEPLOYER)" --rpc-url "$RPC")"
  if (( actual < necesario )); then
    echo "La wallet admin necesita al menos $(cast from-wei "$necesario") ETH (hoy tiene $saldo). Fondeala con un faucet de Base Sepolia y volvé a correr este comando." >&2
    exit 1
  fi
  for r in ORIGINADOR ORACULO INVERSOR1 INVERSOR2; do
    a="$(dir "$r")"
    if [[ "$(cast balance "$a" --rpc-url "$RPC")" == "0" ]]; then
      echo "→ $r: envío $POR_WALLET ETH"
      cast send "$a" --value "${POR_WALLET}ether" --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC" >/dev/null
    else
      echo "→ $r: ya tiene gas, no envío"
    fi
  done
  echo; mostrar
else
  mostrar
fi
