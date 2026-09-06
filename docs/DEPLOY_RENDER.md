# Deploying `susu-web` to Render

This is a **static site**, and that is worth stating at the top because it changes what you are
deploying. `pnpm build` produces a directory of files; nothing here needs to be running for them to
be served, and Render puts them on a CDN.

The app talks to Stellar directly from the browser, so the chain, the wallet and the read model are
its dependencies — but there is no server-side component of this repository that *could* be hosted,
and hosting one would not add anything. The one exception is `susu-api`, which is a separate
service with [its own deployment guide](https://github.com/susu-labs/susu-api/blob/main/docs/DEPLOY_RENDER.md).

`render.yaml` in the repository root is the blueprint. The part of this page worth reading is
[configuration is compiled in](#configuration-is-compiled-in), because it is the difference between
a settings change taking effect and a settings change appearing to do nothing.

---

## What Render runs

| | |
| --- | --- |
| Runtime | **Static site** (`runtime: static`) |
| Plan | `free` |
| Build | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Publish path | `./dist` |
| Node | `22` |

**Do not set a Root Directory.** It is the repository root — Render's field means "where the
project is", not "where the source is". Pointing it at `src` leaves it with no `package.json`, no
lockfile and no Vite config.

The build command is explicit rather than assumed. `corepack enable` makes the build use the pnpm
pinned in `packageManager` rather than whichever version happens to be on the builder, and
`--frozen-lockfile` makes it build the commit that was pushed rather than something that merely
satisfies the manifest. The project's own `build` script begins with `tsc --noEmit`, so a type error
fails the deploy — which is the only place in this deployment path where anything is checking.

---

## Before you start

**1. The Supabase URL and anon key.** The anon key is public by design and protected by Row Level
Security. It must never be the service-role key — that one bypasses RLS, belongs only to `susu-api`,
and there is a CI check (`pnpm check:bundle`) that fails the build if a server-side credential ends
up in the bundle.

**2. The `susu-api` URL**, including the `/api/v1` prefix. If the API is not deployed yet, deploy it
first: see [deploy order](https://github.com/susu-labs/susu-api/blob/main/docs/DEPLOY_RENDER.md#deploy-order).
The app is optional about this — group state is read straight from the chain, so only invite codes
need the API, and the screens that do say so rather than failing obscurely.

**3. A service name you are happy with.** Render derives the subdomain from it, `susu-web` becomes
`https://susu-web.onrender.com`, and you need to know the URL *during* creation for the next point.
Pick the name before you start.

---

## Deploy

1. Render Dashboard → **New** → **Blueprint**.
2. Connect the `susu-labs/susu-web` repository.
3. Render reads `render.yaml` and prompts for the four `sync: false` variables.
4. Fill them in and create the site.

The variable that needs care is `VITE_APP_URL`: it is this app's own public URL, and you are being
asked for it before the service exists. Render's blueprint format has no variable interpolation, so
it cannot be derived. Use the URL you expect from the name you chose — and if the subdomain turns out
to be different, set it correctly and redeploy, because authentication emails depend on it.

### The values Render prompts for

| Variable | Value |
| --- | --- |
| `VITE_APP_URL` | This site's URL, e.g. `https://susu-web.onrender.com` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon/publishable** key — never the service-role key |
| `VITE_API_BASE_URL` | `https://<api>.onrender.com/api/v1` — note the prefix |

The contract IDs, the RPC URL, the explorer URL and the network are already in the blueprint. They
are public addresses recorded in `susu-contracts/docs/TESTNET.md`, and writing them down here is not
a disclosure.

---

## Configuration is compiled in

Every variable this app reads is prefixed `VITE_`, and Vite **substitutes those at build time**. They
are baked into the JavaScript bundle; nothing reads `process.env` at runtime, because there is no
runtime.

Two consequences, both of which have cost people an afternoon:

- **Changing a value requires a redeploy, not a restart.** There is no server to restart. Editing an
  environment variable in the dashboard and waiting will not change what the app does.
- **A browser holding a cached bundle keeps using the old value** until it reloads. This is why
  `index.html` is served `Cache-Control: no-store` — a stale entry document would keep requesting the
  previous build's asset hashes, which are no longer deployed.

And one consequence that is a security property rather than an inconvenience: **only browser-safe
values may appear in this file**. A service-role key or a database password placed here would be
published to every visitor. `src/lib/env.ts` refuses to start if it detects one, and CI scans the
built bundle for the same thing.

---

## Verify

```bash
# It serves the app.
curl -sS -o /dev/null -w '%{http_code}\n' https://<name>.onrender.com

# The SPA fallback works: a deep link is a router route, not a file on disk. This
# must be 200 and must be the entry document, not a 404.
curl -sS -o /dev/null -w '%{http_code}\n' https://<name>.onrender.com/app/groups/123

# Security headers are being applied.
curl -sSI https://<name>.onrender.com | grep -iE 'x-frame-options|referrer-policy|x-content-type-options'
```

Then open the site, connect Freighter on **Testnet**, and confirm it can read a group.

The rewrite rule cannot break the hashed assets, and it is worth knowing why rather than taking it
on faith: Render serves a resource directly when one exists at the requested path and only consults
route rules when none does. That is the same guarantee nginx gets from `try_files $uri`, and the
reason a missing `/assets/*.js` still 404s honestly instead of being answered with `index.html` —
which the browser would report as *"expected a JavaScript module, got text/html"*, pointing at the
wrong problem.

---

## Add the redirect URLs to Supabase

Not optional, and not part of this repository's configuration.

Supabase → **Authentication** → **URL Configuration** → **Redirect URLs**:

```
{your web URL}/app              # where a confirmed signup lands
{your web URL}/reset-password   # where a recovery link lands
```

When these are missing Supabase **substitutes the project's Site URL instead of refusing**. The
email arrives, the link appears broken, and it looks like a bug in this app rather than a missing
setting. Configure both at once.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Deploy fails, "no such file: package.json" | Root Directory is set to `src`. Clear it |
| Build fails on `tsc` | A type error. This is the deploy doing its job — reproduce with `pnpm typecheck` |
| Build fails on `--frozen-lockfile` | `package.json` and `pnpm-lock.yaml` disagree. Run `pnpm install` locally and commit the lockfile |
| Blank page, console shows a module MIME error | A hashed asset 404s. The deploy is incomplete or the browser is holding a stale `index.html` |
| Deep link 404s, root works | The rewrite rule is missing. Confirm `routes:` is present in `render.yaml` |
| App loads but invite screens fail | `VITE_API_BASE_URL` is wrong, missing `/api/v1`, or `CORS_ALLOWED_ORIGINS` on the API does not list this origin |
| Wallet connect does nothing | Freighter is set to the wrong network, or `Cross-Origin-Opener-Policy` was added to the headers. The Freighter adapter talks to the extension through a window handle, and that header severs it — which is why it is deliberately absent |
| Auth email link lands on the wrong page | The redirect URLs above are missing from Supabase |
| Changed a `VITE_` variable, nothing happened | It is compiled in at build time. Redeploy |

---

## The Docker path

`Dockerfile` and `docker/nginx.conf` in this repository build and serve the same `dist/` directory
with nginx, and Render will use them if the service's runtime is switched to Docker. It sets the same
security headers, from `docker/security-headers.conf`, and the same SPA fallback.

It exists for environments where a container is the unit of deployment. On Render it is not the
better option: the static runtime is cheaper, needs no image build, and puts the files on a CDN. Both
serve one directory of files, and the headers are kept in step by hand — if you change one, change
the other.

---

## What this does not do

- **It does not deploy to Mainnet.** `VITE_STELLAR_NETWORK` is `testnet`, and the client refuses
  Mainnet writes in code (`src/lib/stellar/network.ts`) rather than by configuration. Mainnet
  requires the readiness gate in
  [`susu-contracts/docs/MAINNET_READINESS.md`](https://github.com/susu-labs/susu-contracts/blob/main/docs/MAINNET_READINESS.md)
  to be passed first.
- **It cannot move money.** It builds transactions, asks a wallet to sign them, submits them, and
  reports what the chain actually did. Closing this service changes nothing about anyone's balance —
  a property of the design, not of good intentions.
