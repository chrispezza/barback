# Secrets for the compose stack, resolved from 1Password at run time. Safe to commit:
# these are references, not values. Use with:
#   op run --env-file=deploy/.env.tpl -- docker compose -f deploy/docker-compose.yml up -d
# Non-secret overrides (BARBACK_ORIGIN) still go in deploy/.env, which compose loads as before.
MEILI_MASTER_KEY=op://Personal/Barback Meilisearch/master-key
