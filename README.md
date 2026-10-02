# Tandem Office Board

A private, shared Vestaboard controller with a 22 × 6 preview, messages, schedules, daily quiet hours, four modes, PR updates and NBA/NFL scores. It can run without Vestaboard Plus. Team messages and settings live in Cloudflare D1; provider keys are encrypted with AES-GCM and only decrypted by the server.

## Connect it

1. Open the dashboard and select **Connect board**. In Vestaboard's Advanced Settings, create a Cloud API token with Read and Write access. Paste it into the password field. Saving checks read access; Send, a mode change, or the next background check can write to the board.
2. In **Connections → GitHub**, choose the product repository to follow, and a fine-grained GitHub token with **Pull requests: read** for that repository. The dashboard source repository does not have to be the repository watched. Connecting starts from now rather than replaying old PRs.
3. For scores, connect a free BALLDONTLIE key in **Connections → Sports**. Click **Sports**, choose NFL or NBA, and select **Follow on board** on a game. The picker includes live games, today’s results and the next three days, including preseason. Saving the key verifies Games access.
4. Share the private Site with selected teammates using the Site's sharing controls. The configured owner manages connections and defaults; other authorized visitors can send, schedule, pause and select modes.

Manual Send Now takes priority. Scheduled messages and integration events wait for the active hold. Physical requests are serialized and spaced by at least 20 seconds. Quiet hours prevent writes, and messages remain queued. Meeting and Guests modes suppress PR events. PR events older than 30 minutes expire instead of replaying a stale celebration.

GitHub polling can identify a PR's author and the person who merged it. Generic `updated_at` also changes for comments and reviews; an update is labeled **PR updated / author**, never as a verified push actor. Accurate last-pusher attribution is a follow-up webhook integration.

Sports follow the exact selected game ID through midnight and the final score. The followed game is checked every 30 seconds while the dashboard is open; terminal games every five minutes. NBA clock/period are shown when supplied; NFL uses provider status without inventing a clock. Failed requests retain the last scores, report the error and label nonterminal scores delayed after two minutes. Catalogs use a shared two-minute cache. A shared five-request sliding minute budget protects the free feed from rapid game changes across teammates. No sample scores are presented as live data.

**Auto** formats text with alignment and a color strip. **Visual** edits the exact 22×6 grid: eight Vestaboard flap colors, brush sizes, connected fill, selection/recolor/movement, direct cell typing, eraser, undo/redo and clear. White palette buttons have a black outline. Visual messages persist the complete character matrix so sending, scheduling and reloading preserve placement; erasing produces blank (0) and explicit Black uses code 70. App swatch hex values are screenshot approximations; the actual board receives official character codes.

## Timing and background runner

A runner can call the authenticated controller approximately every five minutes. The GitHub Actions workflow is prepared with manual dispatch; its automatic schedule is disabled until the runner is chosen. Sites cloud tasks support hourly cadence. This is a scheduled task, not a hard real-time timer. Scheduled starts, message expiration and score refresh can occur on the next run. The browser reads state every ten seconds and checks due work every 30 seconds. Without an active background runner, updates and scheduled messages require an open dashboard; browser background throttling may delay checks.

Each cloud run must:

1. Reopen this Site using Sites `get_site` (project ID is supplied by the linked task).
2. Obtain its current service-access bearer token in memory. Never print or store it in the task prompt or files.
3. POST to the Site's current live URL plus `/api/controller`. Supply both `OAI-Sites-Authorization: Bearer <token>` (Site gateway) and `Authorization: Bearer <token>` (application controller). An HTTP 200 result contains the saved `lastTick`; 409 means another writer is active and can be retried once later. Other failures require attention.
4. Read the POST result as verification of the committed controller state. Routine runs remain quiet. Notify only when there is a meaningful provider/controller error requiring action, or when the source connection is missing and prevents a requested integration.

The controller can be tested before provider keys are supplied: it updates shared previews and heartbeat without contacting the physical board. Dashboard background status requires a configured cadence and becomes stale after two intervals or at least 15 minutes without a background heartbeat.

For GitHub Actions, configure the repository variable `BOARD_URL` and secret `CONTROLLER_TOKEN`, and enable the commented schedule in `.github/workflows/board-controller.yml`. Private repository runs consume GitHub Actions minutes; scheduled runs may be delayed by GitHub. Never copy a secret into the workflow file.

## Local development

Use Node 22.13+ for development; controller integration tests use Node 25+ built-in SQLite.

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
node --test tests/*.test.mjs
```

Production schema changes belong in `db/schema.ts` plus append-only generated Drizzle migrations. Native Sites publishing applies migrations, configures D1 and deploys the Worker. `build/sites-worker.ts` preserves the platform fetch handler. Do not put credentials into Git, browser storage, URLs or the hosting manifest.

## API

Authenticated `GET /api/board` reads shared state. `GET /api/sports?league=NFL` (or NBA) reads the cached schedule. Owner-only sports connection changes save an encrypted API key; authorized teammates can follow and stop individual games. Authenticated same-origin `POST /api/board` accepts messages, modes, pause/resume, cancellation, settings and owner-only connection/default edits. `POST /api/controller` requires the separate server controller token and acquires the same durable lease as interactive writes. It never returns provider credentials.

## Tandem brand files

The header uses the supplied original transparent Tandem symbol and wordmark PNGs. Original downloads and the full Brand Toolkit Version 001 PDF are attached in the footer under **Brand files**. Logo assets are served from `public/brand/` and preserved unmodified. The original 51 MB PDF is attached in R2 and downloaded through the authenticated `/api/brand/toolkit` route, which keeps it within the private Site audience. The UI uses the toolkit's Black, warm neutral background, Off-white and tan palette, with existing typography retained at the user's request.
