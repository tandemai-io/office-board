# Tandem Office Board

A private, shared Vestaboard controller with a 22 × 6 preview, messages, schedules, daily quiet hours, four modes, PR updates and NBA/NFL scores. It can run without Vestaboard Plus. Team messages and settings live in Cloudflare D1; provider keys are encrypted with AES-GCM and only decrypted by the server.

## Connect it

1. Open the dashboard and select **Connect board**. In Vestaboard's Advanced Settings, create a Cloud API token with Read and Write access. Paste it into the password field. Saving checks read access; Send, a mode change, or the next background check can write to the board.
2. In **Connections → GitHub**, choose the product repository to follow, and a fine-grained GitHub token with **Pull requests: read** for that repository. The dashboard source repository does not have to be the repository watched. Connecting starts from now rather than replaying old PRs.
3. For scores, obtain a BALLDONTLIE key and choose NBA or NFL plus up to four team abbreviations. Basic Games and Teams are available on the provider's free plan, subject to its current limits. The dashboard verifies teams and endpoint access before saving.
4. Share the private Site with selected teammates using the Site's sharing controls. The configured owner manages connections and defaults; other authorized visitors can send, schedule, pause and select modes.

Manual Send Now takes priority. Scheduled messages and integration events wait for the active hold. Physical requests are serialized and spaced by at least 20 seconds. Quiet hours prevent writes, and messages remain queued. Meeting and Guests modes suppress PR events. PR events older than 30 minutes expire instead of replaying a stale celebration.

GitHub polling can identify a PR's author and the person who merged it. Generic `updated_at` also changes for comments and reviews; an update is labeled **PR updated / author**, never as a verified push actor. Accurate last-pusher attribution is a follow-up webhook integration.

Scores display today's selected games, preferring an active game, then a completed game. Multiple selected teams are supported; this first version shows one game at a time. Failed or stale score data falls back to the Sports default and reports the provider error. No sample scores are presented as live data.

## Timing and background runner

A runner can call the authenticated controller approximately every five minutes. The GitHub Actions workflow is prepared with manual dispatch; its automatic schedule is disabled until the runner is chosen. Sites cloud tasks support hourly cadence. This is a scheduled task, not a hard real-time timer. Scheduled starts, message expiration and score refresh can occur on the next run. The browser reads state every ten seconds and checks due work every minute; unattended operation does not depend on an open browser.

Each cloud run must:

1. Reopen this Site using Sites `get_site` (project ID is supplied by the linked task).
2. Obtain its current service-access bearer token in memory. Never print or store it in the task prompt or files.
3. POST to the Site's current live URL plus `/api/controller`. Supply both `OAI-Sites-Authorization: Bearer <token>` (Site gateway) and `Authorization: Bearer <token>` (application controller). An HTTP 200 result contains the saved `lastTick`; 409 means another writer is active and can be retried once later. Other failures require attention.
4. Read the POST result as verification of the committed controller state. Routine runs remain quiet. Notify only when there is a meaningful provider/controller error requiring action, or when the source connection is missing and prevents a requested integration.

The controller can be tested before provider keys are supplied: it updates shared previews and heartbeat without contacting the physical board. Dashboard background status requires a configured cadence and becomes stale after two intervals or at least 15 minutes without a background heartbeat.

For GitHub Actions, configure the repository variable `BOARD_URL` and secret `CONTROLLER_TOKEN`, and enable the commented schedule in `.github/workflows/board-controller.yml`. Private repository runs consume GitHub Actions minutes; scheduled runs may be delayed by GitHub. Never copy a secret into the workflow file.

## Local development

Use Node 22.13+.

```sh
npm install
```

Create an ignored `.env.local` containing `OWNER_EMAIL=seedy@sites.test`, a random 32-byte base64 `SECRET_ENCRYPTION_KEY`, and a random `CONTROLLER_TOKEN`. Production values are configured in Sites, never in source.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fair_aaron_stack.sql
npm run dev
```

Open the printed localhost URL at `/signin-with-chatgpt?return_to=%2F` for the bundled local mock identity. Mock authentication is restricted to local preview; hosted authentication is supplied by Sites.

```sh
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test tests/board.test.mjs
```

Production schema changes belong in `db/schema.ts` plus append-only generated Drizzle migrations. Native Sites publishing applies migrations, configures D1 and deploys the Worker. `build/sites-worker.ts` preserves the platform fetch handler. Do not put credentials into Git, browser storage, URLs or the hosting manifest.

## API

Authenticated `GET /api/board` reads shared state. Authenticated same-origin `POST /api/board` accepts messages, modes, pause/resume, cancellation, settings and owner-only connection/default edits. `POST /api/controller` requires the separate server controller token and acquires the same durable lease as interactive writes. It never returns provider credentials.
