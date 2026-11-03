#!/usr/bin/env bash
# Modellen vergelijken op de testset, zonder iets live te zetten: alleen de testkopie van de chat.
# Gebruik: npm run vergelijk -- gemini-3.5-flash-lite   (of claude-haiku-5-5, claude-sonnet-5-5)
set -euo pipefail
cd "$(dirname "$0")/.."
REF=lsboujprrvhntgbvlvyu
MODEL="${1:?geef een model mee}"; shift
node scripts/sync-projectmodel.mjs
npx supabase functions deploy projecthulp-chat-test --project-ref "$REF" --no-verify-jwt --use-api --yes
mkdir -p testset-resultaten/vergelijk
CHAT_URL="https://$REF.supabase.co/functions/v1/projecthulp-chat-test" node scripts/testset-chat.mjs --model "$MODEL" "$@" || true
cp testset-resultaten/laatste.md "testset-resultaten/vergelijk/$MODEL.md"
echo "Rapport: testset-resultaten/vergelijk/$MODEL.md"
