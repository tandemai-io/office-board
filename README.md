# Tandem Office Board

A shared, sign-in-protected Vestaboard controller with a 22 × 6 preview, messages, schedules, four modes, PR updates and NBA, NFL and college football scores. It can run without Vestaboard Plus. Team messages and settings live in Cloudflare D1; provider keys are encrypted with AES-GCM and only decrypted by the server.

## Connect it

1. Open the dashboard and select **Connect board**. In Vestaboard's Advanced Settings, create a Cloud API token with Read and Write access. Paste it into the password field. Saving checks read access; Send, a mode change, or the next background check can write to the board.
2. In **Connections → GitHub**, choose the product repository to follow, and a fine-grained GitHub token with **Pull requests: read** for that repository. The dashboard source repository does not have to be the repository watched. Connecting starts from now rather than replaying old PRs.
3. For scores, connect a free BALLDONTLIE key in **Connections → Sports**. Click **Sports**, choose NFL or NBA, and select **Follow on board** on a game. The picker includes live games, today’s results and the next three days, including preseason. Saving the key verifies Games access.
4. For college football, connect free API-Sports and Big Balls keys in their Primary/Backup cards. Click **Sports → College football** to pick a game from today’s FBS schedule. The primary switches to the backup when its free budget has 10 requests left or it is unavailable.
5. Share the private Site with selected teammates using the Site's sharing controls. The configured owner manages connections and defaults; other authorized visitors can send, schedule, pause and select modes.

Manual Send Now takes priority. Scheduled messages and integration events wait for the active hold. Physical requests are serialized and spaced by at least 20 seconds. Quiet hours are disabled; pause the controller to stop its writes. Meeting and Guests modes suppress PR events. PR events older than 30 minutes expire instead of replaying a stale celebration.

GitHub polling can identify a PR's author and the person who merged it. Generic `updated_at` also changes for comments and reviews; an update is labeled **PR updated / author**, never as a verified push actor. Accurate last-pusher attribution is a follow-up webhook integration.

Sports follow the exact selected game ID through midnight and the final score. The followed NFL/NBA game is checked every 30 seconds while the dashboard is open; automatic score requests stop once the provider reports final, canceled or abandoned. The final result stays displayed until another game is selected. NBA clock/period are shown when supplied; NFL uses provider status without inventing a clock. Failed requests retain the last scores, report the error and label nonterminal scores delayed after two minutes. Catalogs use a shared two-minute cache. A shared five-request sliding minute budget protects the free feed from rapid game changes across teammates. No sample scores are presented as live data.

College football uses API-Sports (100/day, primary) and Big Balls (250/day, backup), with 10 requests reserved from each allowance and UTC-midnight resets. Daily usage is bootstrapped from API-Sports status and Big Balls usage; attempts are persisted under the shared D1 lease before fetching, including failures. Big Balls minute headers are not treated as daily remaining. Game IDs are mapped by canonical home/away school and kickoff within 90 minutes; missing or ambiguous matches retain the last scores. The same selection survives switching and midnight. College live games check every two minutes, schedules use a ten-minute today-only cache, games more than 30 minutes before kickoff check every 15 minutes, and automatic score requests stop at the final result. College polling stops during an explicit pause. Quiet hours are disabled for all messages and games. Big Balls Free lacks clock/quarter, so those are cleared on switching. Both feeds depleted means hold the last score and label it delayed after six minutes. Team colors are matched to the board palette using public FBS school metadata; unknown schools use neutral colors. No paid plan, trial, credit card or account upgrade is enabled.

Every write uses the documented `forced: true` flag to override Vestaboard's own quiet hours. Legacy dashboard quiet-hours settings are ignored and saved as disabled; the setting is removed from the interface. The sender checks the JSON `status: "ok"` or `"success"` acknowledgement and reads the cloud message back after each accepted write. The owner can check the cloud layout again from the board; a matching cloud layout does not confirm physical flaps or device connectivity. Existing accepted frames are resent once with the override after this upgrade.

Sports color strips use seven primary and three secondary flaps per team, separated by two Black flaps (70) in the center. NFL and college football use a supplemental public ESPN game-summary feed for explicit possession, checked up to every 30 seconds under the shared controller lease. One White flap (69) appears immediately outside the possessing team’s abbreviation. Match discovery requires one exact home/away matchup and kickoff within 90 minutes; the ESPN event ID is cached. Unknown, mismatched, stale, failed, halftime or terminal possession clears the marker. ESPN does not use the configured score-feed quota, and its availability/timing are not guaranteed. NBA has no possession marker. Possession requests also stop at the final result.

**Auto** formats text with alignment and a color strip. **Visual** edits the exact 22×6 grid: eight Vestaboard flap colors, brush sizes, connected fill, selection/recolor/movement, direct cell typing, eraser, undo/redo and clear. White palette buttons have a black outline. Visual messages persist the complete character matrix so sending, scheduling and reloading preserve placement; erasing produces blank (0) and explicit Black uses code 70. App swatch hex values are screenshot approximations; the actual board receives official character codes.

## Timing and background runner

A runner can call the authenticated controller approximately every five minutes. The GitHub Actions workflow is prepared with manual dispatch; its automatic schedule is disabled until the runner is chosen. Weekday Standup has separate Sites cloud tasks for its start and restoration; these do not poll sports or run the ordinary queue. Background jobs are not hard real-time timers. Scheduled starts, message expiration and score refresh can occur on the next run. The browser reads state every ten seconds and checks due work every 30 seconds. Without an active background runner, updates and scheduled messages require an open dashboard; browser background throttling may delay checks.

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

Build the local Worker, then initialize a fresh local database by applying every migration in filename order:

```sh
npm run build
for migration in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration" || exit 1
done
npm run dev
```

Run that migration loop only once for a fresh database. For an existing local database, apply only migrations that have not already run. Keep the same `.wrangler/state` directory when starting the app.

Open the printed localhost URL at `/signin-with-chatgpt?return_to=%2F` for the bundled local mock identity. Mock authentication is restricted to local preview; hosted authentication is supplied by Sites.

```sh
npx tsc --noEmit
npm run lint
node --test tests/*.test.mjs
```

Production schema changes belong in `db/schema.ts` plus append-only generated Drizzle migrations. Native Sites publishing applies migrations, configures D1 and deploys the Worker. `build/sites-worker.ts` preserves the platform fetch handler. Do not put credentials into Git, browser storage, URLs or the hosting manifest.

## Contributing

Ideas, new board features and fixes are welcome. [Open an issue](https://github.com/tandemai-io/office-board/issues) or fork the repository and open a pull request against `main`. Include what changes, a screenshot for visual changes and how you checked it. Before submitting, run the type check, lint and test commands above; use Node 25+ for the controller tests. Run `npm run build` for application changes.

Develop against your own local database and mock identity. Provider keys are optional for previews, and the controller tests use mocked providers. Public source access does not grant access to the live office dashboard or board: the hosted app still uses Sites sign-in and sharing controls. Keep provider calls on the server, credentials encrypted, connection changes owner-only and board writes behind the shared controller lease. Changes must preserve shared state, queued messages and coordination between teammates and background runs. Never include real keys, private messages or production database exports in an issue, pull request or test fixture.

## API

Authenticated `GET /api/board` reads shared state and syncs the current Vestaboard cloud message through a shared 30-second cache. The displayed grid comes from cloud readback, so messages sent in the Vestaboard app appear here too. External messages hold automatic website writes and score polling until an explicit Send Now, game selection, mode change or Resume. Sync continues while paused; failed reads preserve the last known grid and block automatic overwrites. Accepted message IDs, a settling window and a read before automatic writes avoid mistaking delayed readback for external changes. Explicit takeover persists through delivery retries; cross-app writes cannot be made atomic with the cloud API. `GET /api/sports?league=NFL` (or NBA/NCAAF) reads the cached schedule. Owner-only sports connection changes save an encrypted API key; authorized teammates can follow and stop individual games. Authenticated same-origin `POST /api/board` accepts messages, modes, pause/resume, cancellation, settings and owner-only connection/default edits. `POST /api/controller` requires the separate server controller token and acquires the same durable lease as interactive writes. It never returns provider credentials.

## Tandem brand files

The header uses the supplied original transparent Tandem symbol and wordmark PNGs. Original downloads and the full Brand Toolkit Version 001 PDF are attached in the footer under **Brand files**. Logo assets are served from `public/brand/` and preserved unmodified. The original 51 MB PDF is attached in R2 and downloaded through the authenticated `/api/brand/toolkit` route, which keeps it within the private Site audience. The UI uses the toolkit's Black, warm neutral background, Off-white and tan palette, with existing typography retained at the user's request.

If API-Sports temporarily rejects verification with its minute-rate-limit response, its key is saved encrypted with an awaiting-verification badge. Due college checks retry verification after the cooldown and keep using the backup in the meantime. Authentication failures still reject the key.

## Image to board

Click **Image** beside Auto and Visual, then drop or choose a SVG, PNG, JPG or WebP (up to 10 MB; raster images up to 60 megapixels). Conversion stays in the browser: it matches image patches against the eight flap colors and supported white-on-dark letters, digits and punctuation. Colors only is the default, preserving the picture’s colors within the physical palette. Optional Colors + characters and Characters only styles are available; fit or crop; adjust size, contrast and the background. Transparent margins are trimmed by default, with an option to keep them. Files can also be dropped directly on the visual editor. SVGs are parsed and rendered as isolated images, with viewBox-only dimensions normalized before decoding; uploaded markup is never inserted into the page. Auto background preserves dark transparent logos on white. The preview respects the rectangular cell proportions and neutral artwork does not acquire arbitrary colors.

**Use this design** imports all 132 cells into the visual editor as one undoable edit. Sending and scheduling use the existing validated grid path; the original image is never uploaded. The result is a low-resolution approximation, not OCR or a promise to preserve fine detail.


## Weekday Standup

The Schedule tab contains an enabled weekday Standup rule, Monday–Friday 10:00–10:30 in America/Los_Angeles. The display reads `STANDUP` and `10:00 - 10:30 AM PST` as requested; the schedule follows local Pacific daylight-saving changes. The owner can pause future occurrences or edit the message. One-time messages also offer a 30-minute duration.

The recurring controller reads and persists the exact current cloud grid before taking over, including native-app messages. It restores that snapshot at the fixed window end, retains native display ownership, and pauses a website message's remaining duration during the interruption. New explicit website actions or native messages cancel the active occurrence; board credential changes discard its snapshot. Disable affects future occurrences; an active Standup still finishes normally. Global Pause holds all writes until resumed. Duplicate checks are idempotent, failed writes retry without replacing the snapshot, and a missed window is skipped. Cloud acknowledgement does not prove physical delivery.

Authenticated `GET /api/schedules` reports the recurring rule and runner state. `POST /api/schedules` with `{"action":"tick"}` checks only the recurring window without polling sports or consuming the normal queue; it uses the same controller bearer authorization and lease as other writes. `{"action":"runner-ready"}` marks a verified installed runner. The native Sites cloud schedules run the recurring endpoint at 10:00 and 10:30 each weekday; neither depends on an open browser. Tasks obtain the current Site service token using Sites get_site, keep it in memory, and supply it to the matching Site in both OAI-Sites-Authorization and Authorization headers. A 409 busy response or needsRetry requests a bounded retry. Task timing is not a hard real-time guarantee.

## Engineering and production health

The Engineering tab follows selected main-branch CI and production deployment workflows through GitHub's signed `workflow_run` webhook at `/api/integrations/github`. Configure `ENGINEERING_REPOSITORY`, `ENGINEERING_BRANCH`, `ENGINEERING_WORKFLOWS` (a JSON map of workflow filenames to short uppercase labels), and a random secret `ENGINEERING_WEBHOOK_SECRET`. Only configured repository/ref/trusted push or manual runs are accepted. HMAC-SHA256 is checked over the raw body; request size is bounded. No GitHub access token is stored. The exact latest state is atomically materialized per repository/branch/workflow before physical writes, with run/attempt/stage ordering and deduplication. Logs, commit messages, and provider credentials are not stored in these events.

`ENGINEERING_HEALTH_URL` optionally points at the verified HTTPS backend liveness route. Its JSON must report `status: ok` and `service: tandem-backend`. This confirms API reachability, not database/worker/end-to-end health. Two consecutive failed checks flag failure; blocked/rate-limited checks and data over 15 minutes old are unknown. A stale queued/running workflow becomes unknown after two hours. Completed CI/deploy results remain historical results and are not evidence of current uptime.

The dedicated `/api/engineering` runner uses its own `ENGINEERING_RUNNER_TOKEN`, distinct from the full board controller token and webhook secret. The `Engineering status` GitHub Actions workflow in this repository runs approximately every five minutes and accepts manual dispatch. Configure its repository variable `BOARD_URL` and secret `ENGINEERING_RUNNER_TOKEN`. On a public repository it uses standard hosted runners; GitHub may delay scheduled runs or disable inactive scheduled workflows. It probes health and retries engineering display work without polling sports. The separate legacy general controller schedule stays disabled. Signed webhook deliveries trigger an immediate best-effort background write after durable storage; the periodic runner handles rate fences and failures.

Connecting the source does not take over the display. Choose **Engineering → Show on board** to follow it. Standup, manual holds, native-app messages, and global Pause retain their existing priority. Selecting Sports switches away from Engineering. Green means passing CI/deploy results and a reachable API, yellow is work in progress, red is a failed workflow or repeated failed API check, white is unknown/incomplete. Inspect linked workflow runs for details.
