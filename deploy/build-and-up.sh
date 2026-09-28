#!/usr/bin/env bash
# Deploy na VPS do projeto (docs/02 — Hospedagem). Roda NA VPS, como root:
#   /opt/eonarga/deploy/build-and-up.sh 0.19.0
# Espera o fonte já descompactado em /opt/eonarga/src/<versão> (um `git archive` enviado
# da máquina de dev). Constrói a imagem ali mesmo (a VPS tem 4 vCPU / 8 GB), grava a tag
# no .env, sobe o compose e espera o /api/health responder com a versão nova. Guarda as
# duas imagens mais recentes; as anteriores são apagadas.
set -euo pipefail

VERSION="${1:?uso: build-and-up.sh <versão>}"
BASE=/opt/eonarga
SRC="$BASE/src/$VERSION"
[ -d "$SRC" ] || { echo "fonte não encontrado em $SRC"; exit 1; }

cd "$BASE"
echo "== build eonarga:$VERSION"
docker build -q -t "eonarga:$VERSION" "$SRC"

echo "== compose up"
if grep -q '^EONARGA_TAG=' .env; then
  sed -i "s/^EONARGA_TAG=.*/EONARGA_TAG=$VERSION/" .env
else
  echo "EONARGA_TAG=$VERSION" >> .env
fi
docker compose -f compose.prod.yml up -d --remove-orphans

echo "== esperando o app"
PORT="$(grep -E '^EONARGA_PORT=' .env | cut -d= -f2)"
PORT="${PORT:-3010}"
for _ in $(seq 1 60); do
  if body="$(curl -sf "http://127.0.0.1:$PORT/api/health" 2>/dev/null)" && [[ "$body" == *"\"$VERSION\""* ]]; then
    echo "ok: $body"
    break
  fi
  sleep 2
done
[[ "${body:-}" == *"\"$VERSION\""* ]] || { echo "o app não respondeu com a versão $VERSION"; docker compose -f compose.prod.yml logs --tail=40 app; exit 1; }

echo "== limpando imagens antigas (ficam as 2 mais novas)"
docker images --format '{{.Tag}}' eonarga | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | head -n -2 \
  | xargs -r -I{} docker rmi "eonarga:{}" || true
ls -dt "$BASE"/src/*/ | tail -n +3 | xargs -r rm -rf
