#!/usr/bin/env bash
set -e

CONTAINER="veent-db-5434"
DB_NAME="veent_hris"
DB_USER="veent"
DB_PASS="veent"
DB_PORT="5434"
PG_IMAGE="postgres:18"

echo "==> Checking Docker container..."
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "    Container already running."
elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "    Starting existing container ${CONTAINER}..."
  docker start "${CONTAINER}"
else
  # Nothing named ${CONTAINER} exists — make sure the host port is free before we bind it.
  echo "    Checking port ${DB_PORT} is free..."
  PORT_OWNER=$(docker ps --filter "publish=${DB_PORT}" --format '{{.Names}}')
  if [ -n "${PORT_OWNER}" ]; then
    echo "    ERROR: another container is already publishing port ${DB_PORT}: ${PORT_OWNER}" >&2
    exit 1
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/${DB_PORT}") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "    ERROR: something is already listening on port ${DB_PORT} (not a Docker container)." >&2
    echo "           Free the port or change DB_PORT before running again." >&2
    exit 1
  fi

  echo "    Creating container ${CONTAINER}..."
  # Host networking (not -p bridge publishing) so the container never depends on the
  # docker0 bridge — a down/IP-less docker0 (kept that way to stop it shadowing wlan0)
  # would otherwise make docker-proxy accept connections it can't relay (Prisma P1001).
  # Postgres binds the host directly on DB_PORT via `-c port=`; :5432 is already taken.
  docker run -d --name "${CONTAINER}" \
    --network host \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASS}" \
    -e POSTGRES_DB="${DB_NAME}" \
    "${PG_IMAGE}" \
    -c port="${DB_PORT}"
fi

echo "==> Waiting for Postgres to accept connections (up to 60s)..."
# Bounded: a legacy bridge container runs Postgres on internal :5432, so pg_isready
# against ${DB_PORT} would never succeed and this loop would otherwise hang forever.
WAITED=0
until docker exec "${CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" -p "${DB_PORT}" >/dev/null 2>&1; do
  WAITED=$((WAITED + 1))
  if [ "${WAITED}" -ge 60 ]; then
    echo "    ERROR: Postgres did not become ready on port ${DB_PORT} within 60s." >&2
    echo "           If ${CONTAINER} is a legacy bridge container (published :${DB_PORT}->5432)," >&2
    echo "           Postgres listens on :5432 inside it and will never answer on :${DB_PORT}." >&2
    echo "           Fix: recreate on host networking — 'docker rm -f ${CONTAINER} && ./start.sh'" >&2
    echo "           Otherwise check the container logs: docker logs ${CONTAINER}" >&2
    exit 1
  fi
  sleep 1
done

# pg_isready above only proves Postgres is up *inside* the container — not that the
# host can reach it. Probe the real target from the host so a broken path fails loudly
# here instead of hanging until Prisma times out with P1001. In host-network mode
# Postgres binds the host directly; in legacy bridge mode we'd reach it over docker0.
echo "==> Verifying the host can actually reach the DB..."
# Pick the probe target by network mode. Host networking (our default) binds the host
# directly, so probe 127.0.0.1:DB_PORT. Legacy bridge mode must be reached over docker0
# at the container IP (host-mode containers render an "invalid IP" here, so key off the
# mode, not the address).
if [ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "${CONTAINER}" 2>/dev/null)" = "host" ]; then
  PROBE_HOST="127.0.0.1"; PROBE_PORT="${DB_PORT}"; BRIDGE_MODE=0
else
  PROBE_HOST="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${CONTAINER}" 2>/dev/null)"
  PROBE_PORT="5432"; BRIDGE_MODE=1
fi
if ! timeout 5 bash -c "exec 3<>/dev/tcp/${PROBE_HOST}/${PROBE_PORT}" 2>/dev/null; then
  echo "    ERROR: Postgres is running, but the host cannot reach it at ${PROBE_HOST}:${PROBE_PORT}." >&2
  if [ "${BRIDGE_MODE}" = "1" ]; then
    echo "           This container uses the docker0 bridge; docker-proxy accepts on" >&2
    echo "           :${DB_PORT} but can't relay, so DB connections would hang (P1001)." >&2
    DOCKER0_STATE=$(ip -br addr show docker0 2>/dev/null)
    echo "           docker0: ${DOCKER0_STATE:-missing}" >&2
    echo "           Fix: recreate on host networking — 'docker rm -f ${CONTAINER} && ./start.sh'" >&2
    echo "           (or restore the bridge: sudo ip addr add 172.17.0.1/16 dev docker0 && sudo ip link set docker0 up)" >&2
  else
    echo "           Postgres isn't listening on the host at :${PROBE_PORT}. Check the" >&2
    echo "           container logs: docker logs ${CONTAINER}" >&2
  fi
  exit 1
fi

echo "==> Syncing Prisma schema..."
# Load .env.dev explicitly: this calls prisma directly (not the db:push npm script),
# and prisma only auto-loads a file literally named .env, which no longer exists.
bunx dotenv -e .env.dev -- prisma db push --skip-generate

echo "==> Checking if seed is needed..."
ORG_COUNT=$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -p "${DB_PORT}" -tc \
  "SELECT COUNT(*) FROM \"Organization\";" 2>/dev/null | tr -d ' ' || echo "0")

if [ "${ORG_COUNT}" = "0" ] || [ -z "${ORG_COUNT}" ]; then
  echo "==> Seeding database..."
  # Local dev uses the full roster (manager/employee/verifier/approver + demo data),
  # matching what the E2E suite expects. Prod uses the minimal `bun run db:seed`.
  bun run db:seed:e2e
else
  echo "    Database already seeded (${ORG_COUNT} organization(s) found)."
fi

echo "==> Starting dev server + Discord bot (Ctrl-C stops both)..."
# Kill the whole process group on exit so the bot doesn't linger.
trap 'kill 0' EXIT INT TERM
# Bot in the background (fails soft if its env is missing); dev server in the foreground.
bun run bot &
bun run dev
