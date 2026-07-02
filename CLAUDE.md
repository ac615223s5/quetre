# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Quetre is a libre, privacy-focused alternative front-end for Quora. It has no database and no accounts: it proxies requests to `quora.com`, scrapes structured data out of the returned HTML, and re-renders it as its own lightweight pages (or JSON via an unofficial API). It's an Express app using ES modules (`"type": "module"`), Pug for templating, and Sass for styles.

## Commands

Package manager is **pnpm** (swap `pnpm` → `npm run` if using npm; the Dockerfile uses pnpm).

- `pnpm dev` — run Sass in watch mode + server via nodemon with `NODE_ENV=development` (enables morgan request logging and full error stack traces in responses). This is the normal local dev command.
- `pnpm start` — build compressed CSS once, then `node server.js` (production entry point, no watcher).
- `pnpm prod` — build CSS, then run server under nodemon (no dev env vars).
- `pnpm sass:watch` / `pnpm sass:build` — compile `views/sass/main.scss` → `public/css/styles.css` (build = compressed). CSS is a build artifact under `public/` and is gitignored/nodemon-ignored; **you must run Sass for style changes to appear**.
- Lint: `npx eslint .` (config: airbnb-base + prettier). Format: `npx prettier --write .`.

There is **no test suite**. Server runs at `http://localhost:3000`. Redis is optional — see Caching below.

Config is via `.env` (copy from `.env.example`). Notable vars: `PORT`, `NODE_ENV`, `CACHE_PERIOD` (browser cache for static assets), `AXIOS_USER_AGENT`/`AXIOS_ACCEPT` (headers Quora sees), `REDIS_URL`/`REDIS_TTL` (caching), `NO_UPGRADE` (set when serving over http, e.g. Tor/i2p, to disable the `upgrade-insecure-requests` CSP directive).

## Architecture

Request flow (both web and API share the same fetch/cache/parse core, differing only in the final response format):

```
routes/ → controllers/ → utils/getOrSetCache → fetchers/ → utils/parse → (render Pug | send JSON)
```

1. **`app.js`** configures Express: helmet CSP, compression, static assets, Pug view engine (views live in `views/pug/pages`). A middleware attaches `req.urlObj` (a parsed `URL`) to every request. Mounts `viewRouter` at `/` and `apiRouter` at `/api/v1/`. Unmatched routes throw a 404 `AppError`; `controllers/errorController.js` is the terminal error handler.
2. **`server.js`** is the entry point: loads dotenv, starts the server, wires `uncaughtException`/`unhandledRejection` handlers.
3. **`routes/viewRoutes.js` & `routes/apiRoutes.js`** define nearly parallel route tables. Key quirk: the catch-all `/:slug` route maps arbitrary Quora question slugs to the `answers` handler — this is how `quetre.example/Some-Question` works. Route order matters (specific routes before `/:slug`).
4. **`controllers/viewController.js` & `controllers/apiController.js`** are thin: pull `slug`/`name` + `lang` off the request, call `getOrSetCache(key, fetcher, ...args)`, then either `res.render(...)` a Pug page or `res.json(...)`. Static pages (about, privacy) and status routes (`unimplemented` = 501, `gone` = 410) also live here.
5. **`fetchers/`** contain the scraping logic — the fragile heart of the app:
   - `fetcher.js` — generic: GET the resource, load HTML with cheerio, regex out a `"{\"data\":{\"<keyword>...}"` blob from a `<script>` tag, `parse()` it. Used by `getTopic.js` and `getProfile.js`.
   - `answersFetcher.js` — bespoke for answer pages: iterates ~9-10 `<script>` tags, each containing a `someProp.push("<data>")` payload, and classifies each blob (question block, primary answer, additional answers, related-questions/answer-count block) by probing for marker fields. Explicitly "brittle logic, but works".
   - `getAnswers.js` / `getTopic.js` / `getProfile.js` reshape raw scraped data into the clean object the views/API consume, running every Quora URL through `quetrefy()`.
6. **`utils/`**:
   - `parse.js` — `JSON.parse` wrapper that repairs Quora's invalid `\x3C` escape sequences into valid `<`. Used everywhere raw blobs are parsed.
   - `urlModifiers.js` `quetrefy()` — rewrites Quora URLs to internal ones: `www.` → path, a language subdomain (`es.quora.com`) → `?lang=es`, anything else → treated as a Space (`/space/<subdomain>...`).
   - `getOrSetCache.js` + `redis.js` — caching. `redis.js` exports a **no-op stub** when `REDIS_URL` is unset, so caching silently disables without code branches. Cache keys built in `cacheKeys.js` (`answers:<slug>&lang=<lang>` etc.).
   - `getAxiosInstance.js` — axios instance with `baseURL` `https://<subdomain>.quora.com` (subdomain = language). Reused (with overridden baseURL) by the image proxy.
   - `AppError.js` — operational-error class (`name = 'OperationalError'`, carries `statusCode`/`status`). The error handler only leaks real messages for these; non-operational errors become a generic message in production.
   - `catchAsyncErrors.js` — wraps async controllers to forward rejections to Express. `constants.js` holds `acceptedLanguages` (Quora subdomains) and `nonSlugRoutes` (favicon etc. that must not be treated as question slugs). `log.js` — console logger.
7. **`controllers/apiController.js` `image` handler** proxies Quora CDN images: it streams `https://<domain>/<path>` back to the client, but only if `domain` ends with `quoracdn.net` (SSRF guard). This is API-only.

### Language/i18n

Quora serves localized content from language subdomains. A `?lang=xx` query param flows: controller → fetcher → `getAxiosInstance(lang)` → `https://xx.quora.com`. `quetrefy()` and the `/redirect/*` route translate between Quora's subdomain scheme and Quetre's `?lang=` scheme. Supported langs are whitelisted in `constants.js`.

### Views

Pug templates in `views/pug/` (`pages/` rendered by controllers; `layout/`, `mixins/` are partials; `base.pug` is the shared skeleton). Sass in `views/sass/` compiles to a single `public/css/styles.css`. Client-side JS (theme toggle, MathJax for equations) is plain static files under `public/js` and `public/mathjax`.

## Working on the scrapers

The fetchers depend on the exact shape of Quora's embedded JSON and their `<script>`-tag delivery mechanism. When Quora changes their site, these break first — symptoms are `"couldn't retrieve data"` (500) errors. `fetcher.js`/`answersFetcher.js` already map upstream 404 → 404 and 403/429 → 503 ("Quora is rate limiting this instance"). When adjusting scraping, verify against live pages and expect the marker-field heuristics in `answersFetcher.js` to need updating.
