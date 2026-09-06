# syntax=docker/dockerfile:1

# Susu Protocol web client — a static SPA, built with the project's pinned pnpm
# and served by nginx.
#
#   docker build \
#     --build-arg VITE_APP_URL=http://localhost:8080 \
#     --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=<publishable/anon key> \
#     -t susu-web .
#   docker run --rm -p 8080:8080 susu-web
#
# Build arguments, not runtime environment variables, because `import.meta.env`
# is a compile-time substitution: Vite inlines these strings into the JavaScript
# it writes. Setting them on `docker run` would change nothing.

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
# Pinned to the major that `package.json` declares in `engines` and that CI
# installs, so the bundle is produced by the same toolchain in both places.
FROM node:22-alpine AS build

WORKDIR /app

# pnpm is not installed from npm here. `corepack` ships with Node and reads the
# `packageManager` field in package.json, so the exact version the lockfile was
# written with is the one that runs; installing `pnpm@latest` would let the
# image's install drift away from CI's with no diff to show for it.
RUN corepack enable
# Without this corepack asks for confirmation before downloading the pinned
# version, and a build with no TTY hangs instead of failing.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Manifests only, so that editing a source file reuses the dependency layer.
COPY package.json pnpm-lock.yaml ./

# `HUSKY=0` because git hooks are meaningless in a build container: `.git` is not
# in the context (see .dockerignore) and nothing here commits. Without it the
# `prepare` script would try to install a hook into a repository that does not
# exist.
RUN HUSKY=0 pnpm install --frozen-lockfile

COPY . .

# Browser-visible configuration, inlined into the bundle at build time.
#
# VITE_SUPABASE_ANON_KEY — and the URL next to it — are public by design. The
# anon key is delivered to every browser that loads the app and is protected by
# row-level security, not by secrecy; it is not a secret and rotating it is not
# a security control. The service-role key is the opposite: it bypasses
# row-level security entirely and MUST NEVER be passed here or placed in any
# `VITE_*` variable. `src/lib/env.ts` refuses to start if it finds one, and
# `pnpm check:bundle` below fails the build if credential material of any kind
# reached the output.
#
# Declared as ARG rather than ENV so a build-only value does not persist in the
# image's metadata — the bundle already contains what the browser needs.
ARG VITE_APP_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STELLAR_NETWORK=testnet
ARG VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
ARG VITE_FACTORY_CONTRACT_ID
ARG VITE_USDC_CONTRACT_ID
ARG VITE_EXPLORER_BASE_URL=https://stellar.expert/explorer/testnet
ARG VITE_API_BASE_URL

# Fail with a readable message instead of producing a broken image. All three are
# required by `src/lib/env.ts`, so a build without them would succeed and then
# refuse to start in the browser — a much worse place to discover a missing
# value than the build log.
RUN test -n "$VITE_APP_URL" \
 && test -n "$VITE_SUPABASE_URL" \
 && test -n "$VITE_SUPABASE_ANON_KEY" \
 || { echo "Build args VITE_APP_URL, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required." >&2; exit 1; }

# `VITE_API_BASE_URL` is the one optional value: the app reads group state
# straight from the chain and works without a backend, and `src/lib/env.ts`
# accepts either a URL or nothing at all. Nothing, though, means *absent* — an
# empty string is a defined value that fails its `url()` check and stops the app
# starting, so it is exported only when it was actually supplied. Vite reads
# `VITE_*` variables straight out of the process environment, so an exported
# variable is picked up by the build below with no `.env` file involved.
#
# The two contract IDs have no default and no guard, because an empty one is
# valid: `src/lib/env.ts` accepts `''` for them, which is the same shape CI
# builds with when it has no deployed addresses, and the screens that need a
# contract say so rather than failing obscurely.
#
# The remaining values are passed explicitly rather than left to the ambient
# environment, so that what the bundle was built from is visible in the one RUN
# line that builds it.
RUN if [ -n "$VITE_API_BASE_URL" ]; then export VITE_API_BASE_URL="$VITE_API_BASE_URL"; fi; \
    VITE_APP_URL="$VITE_APP_URL" \
    VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
    VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
    VITE_STELLAR_NETWORK="$VITE_STELLAR_NETWORK" \
    VITE_STELLAR_RPC_URL="$VITE_STELLAR_RPC_URL" \
    VITE_FACTORY_CONTRACT_ID="$VITE_FACTORY_CONTRACT_ID" \
    VITE_USDC_CONTRACT_ID="$VITE_USDC_CONTRACT_ID" \
    VITE_EXPLORER_BASE_URL="$VITE_EXPLORER_BASE_URL" \
    pnpm build

# The check CI runs, moved here so that it can stop a bad image from existing
# rather than reporting on it afterwards. It scans the built output for
# credential *material* — a `service_role` JWT, an `sb_secret_` key, a
# password-bearing database URL — because that is what a mis-passed build
# argument would look like. A build argument is the easiest way to leak one of
# those into a bundle, which is why the check belongs in this file.
RUN pnpm check:bundle

# ---------------------------------------------------------------------------
# Stage 2 — serve
# ---------------------------------------------------------------------------
# `nginx-unprivileged` is the same nginx, configured to run as the `nginx` user
# and to listen on 8080. The stock image runs as root and binds 80, which means
# a compromise of the server starts with root inside the container; this one
# starts with nothing. It is published by nginx itself, so it is not a
# third-party rebuild of the image being relied on.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# Replacing `conf.d/default.conf` keeps the image's own nginx.conf, which already
# sets the worker user, pid path and log destinations — replacing the whole file
# is how a project ends up running as root by accident.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/susu-security-headers.conf

# Only the built output is copied across. Nothing from the build context — no
# source, no lockfile, no `.env` that might have been left lying around — can
# reach the image that runs.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# There is no application process to monitor: nginx serves static files, and a
# healthcheck for a static image can only say whether the entry document is
# still being served. That is worth knowing — a bad `COPY`, or a `root`
# directive that stopped matching, is exactly the failure this catches — but it
# is not a claim that the app's JavaScript works, and it should not be read as
# one. `/` is requested rather than a bespoke endpoint so that the check follows
# the same SPA fallback a browser does.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

# Declared explicitly even though the base image already drops to `nginx`, so
# that the intent survives an edit to the line above.
USER nginx

# The base image's entrypoint runs nginx in the foreground.
CMD ["nginx", "-g", "daemon off;"]
