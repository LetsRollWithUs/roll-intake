#!/usr/bin/env bash
# Vrijgave van Jouw schilderplan (edge function projecthulp-chat): eerst de testkopie, dan de testset, pas dan live.
# Haalt de testset de normen niet (exitcode 1), dan stopt dit script en blijft de live chat zoals hij was.
set -euo pipefail
cd "$(dirname "$0")/.."
REF=lsboujprrvhntgbvlvyu
node scripts/sync-projectmodel.mjs
npx supabase functions deploy projecthulp-chat-test --project-ref "$REF" --no-verify-jwt --use-api --yes
CHAT_URL="https://$REF.supabase.co/functions/v1/projecthulp-chat-test" node scripts/testset-chat.mjs "$@"
npx supabase functions deploy projecthulp-chat --project-ref "$REF" --no-verify-jwt --use-api --yes
echo "Testset geslaagd en live gezet."
