# Feedbacker

Feedbacker is a small, self-hosted web app to make forms and collect feedback.
You build a form in a drag-and-drop editor, share a link or a QR code, and read the answers.

- **Owner only:** Only the owner can open dev mode (`/admin`). The username and password come from `.env`.
- **Drag-and-drop editor:** Sections contain rows. Rows contain 1 to 4 columns. Columns contain blocks.
  Drag blocks, rows and sections to move them. Drop a block above, between or below rows to make a new row.
- **"Other" option:** single and multiple choice can add an "Other" choice (you can rename it) where people type
  their own answer.
- **Blocks:** short text, long text, email, number, single choice, multiple choice, dropdown, rating, scale, yes/no,
  date, heading, paragraph, image, divider and button.
- **Pages:** Each section is its own page. Visitors move through the pages with Next and Back.
- **Conditional logic:** A section or block can show only if earlier answers match rules
  (for example "Show if *Did you like it?* is *No*").
- **Images:** upload a PNG, JPEG, GIF or WebP file (up to 5 MB) from your computer, or use an image URL.
- **Themes:** 19 premade themes from the Feedbacker design system (Default, Aurora, Ocean, Sunset, Forest, Midnight,
  Mono, Pixel, Voltage, Ledger, Gallery, Mission, Blush, Brutal, Nocturne, Doodle, Cosmic, Poster, Zen) or a custom
  theme (accent color, font, corners; a too-light accent is darkened for light mode and lifted for dark mode). Every theme has a light and a dark version. The color mode is Auto (follows the visitor's device),
  Light or Dark.
- **Backgrounds:** each premade theme has one of 19 matching animated backgrounds. You can pick the background on its own: another animated one, a plain color, or an uploaded image, GIF or
  video (MP4/WebM, up to 25 MB), with fade and blur controls. Animations stop for visitors who ask for reduced motion.
- **Typography:** per form, pick fonts for questions and headings from 35 options (8 system stacks, 27 self-hosted
  web fonts), pairing presets, text size, line height, heading weight and case, and title alignment.
- **Drafts and publishing:** Save draft keeps your work without touching the live link. Publish updates the live link.
  New forms are not live until their first Publish.
- **Dev mode settings** (`/admin/settings`): 7 dev themes (Default, Workbench, Blueprint, Arcade, Ink, Dusk, Paper),
  Auto/Light/Dark, and fonts for the interface, headings and labels, with pairing presets. Only the owner sees these.
- **Preview and share link** for each form.
- **QR codes:** a plain default code, or a custom one: "match the form theme" or your own colors, gradients (linear at any angle,
  radial, or one color per corner; 2-4 colors; 8 presets),
  4 code shapes, 3 corner frames, 3 corner dots, a logo, a caption frame and a margin. A real QR decoder checks
  each design while you edit it. Download as PNG or SVG.
- **Responses:** a summary with counts, percentages and averages for each question, a table you can search, sort and
  filter from its column titles, and a CSV export. The forms list can be sorted and filtered too.
- **Landing page** at `/`: Paper by default, or Arcade (Settings → Appearance → Landing page). Dev mode is at `/admin`.
- **Status ticker**: in the Arcade and Paper dev themes, a scrolling line under the top bar repeats the page's key facts
  (save state, counts, settings). Screen readers skip it; every fact also shows on the page. It stops under reduced motion.
- **Logo and motion**: the "Falling" mark from the design system, with a favicon that follows light and dark mode.
  The mark lifts on hover, plays an intro once per visit on the landing page, marks loading states and settles on the thank-you page.
  All motion stops when the device asks for reduced motion.
- **One data folder** holds the SQLite file and the uploaded images. There are no external services.

## Tech stack

| Part | Choice |
|---|---|
| Runtime | [Bun](https://bun.com) 1.4+ |
| Server | [Hono](https://hono.dev) 4, `bun:sqlite` |
| Frontend | [Solid](https://solidjs.com) 1.9 + TSX, built with Vite 8 |
| Drag and drop | Own engine (`src/admin/dnd.ts`, `moves.ts`, `motion.ts`), no library |
| QR codes | [`uqr`](https://github.com/unjs/uqr) (encoding) + our SVG renderer (`src/qr/`), [`jsqr`](https://github.com/cozmo/jsQR) for the scan check |

The public form page loads about 22 KB (gzip) of JavaScript and CSS. The editor code loads only in dev mode.

## Quick start (local)

You need [Bun](https://bun.com/docs/installation) 1.4 or later.

1. Clone the repository and install the packages:
   ```bash
   git clone https://github.com/FishyWeed/Feedbacker.git
   cd Feedbacker
   bun install
   ```
2. Copy the example settings and set your own owner username and password (at least 8 characters):
   ```bash
   cp .env.example .env
   ```
3. Build the frontend and start the server:
   ```bash
   bun run build
   bun run start
   ```
4. Open <http://localhost:3000/admin> and sign in.

### Development mode

```bash
bun run dev
```

This starts the API server on port 3000 and the Vite dev server on port 5173.
Open <http://localhost:5173/admin>. The pages reload when you change the code.

| Command | What it does |
|---|---|
| `bun run dev` | Starts the API server and the Vite dev server. |
| `bun run build` | Builds the frontend into `dist/`. |
| `bun run start` | Starts the server. It serves the API and `dist/`. |
| `bun test` | Runs the tests (rules, answer checks and API). |
| `bun run typecheck` | Checks the TypeScript types. |

## Configuration

Bun reads `.env` automatically. Never commit `.env`: it holds your password.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `ADMIN_USERNAME` | Yes | – | Owner username for dev mode. |
| `ADMIN_PASSWORD` | Yes | – | Owner password. At least 8 characters. The server does not start without it. |
| `PORT` | No | `3000` | HTTP port. |
| `DATABASE_PATH` | No | `data/feedbacker.db` | Path of the SQLite file. The folder is made if it does not exist. Uploaded images go into an `uploads` folder next to it. |

## Deploy

**Warning:** Always serve Feedbacker over HTTPS in production. Without HTTPS, the owner password and the session cookie
travel as plain text.

All data (the SQLite database, uploaded images and the session secret) is in one folder, `/app/data`. Every option
below keeps that folder on a persistent disk. Hosts without a persistent disk (Netlify, Vercel and other serverless
hosts) cannot run Feedbacker.

| Option | Best when | HTTPS |
|---|---|---|
| A: Docker on your own server | You have a server, or want the lowest cost and full control | You add Caddy (example below) |
| B: Fly.io | You want a managed host and deploy from your computer with `fly deploy` | Included |
| C: Railway | You want a managed host that deploys each push to GitHub | Included |
| D: a plain server without Docker | You cannot use Docker | You add a reverse proxy |

### Option A: Docker (recommended)

1. Make `.env` (see [Configuration](#configuration)).
2. Build and start the container:
   ```bash
   docker compose up -d --build
   ```
3. Open `http://<your-server>:3000/admin`.

The database and the uploaded images are in the Docker volume `feedbacker-data`. To back them up, copy the folder
`/app/data` out of the container (for example with `docker compose cp feedbacker:/app/data ./backup`).

For HTTPS, put a reverse proxy in front of the container. Example with [Caddy](https://caddyserver.com)
(it gets the certificate for you):

```
feedback.example.com {
    reverse_proxy localhost:3000
}
```

The proxy must send `X-Forwarded-Proto: https` (Caddy does this). The server then marks the session cookie `Secure`.

### Option B: Fly.io

The repository has a `fly.toml`: one machine, HTTPS, and a volume at `/app/data` for all data.

**Warning:** Run exactly one machine. Each machine gets its own volume, so two machines would hold two different
copies of your forms and responses.

1. Install `flyctl` (see [fly.io/docs/flyctl/install](https://fly.io/docs/flyctl/install/)) and sign in:
   ```bash
   fly auth login
   ```
2. In the repository folder, create the app from the existing config. Pick a unique app name and the region nearest
   to you. If it offers a database (Postgres, Redis), answer no: Feedbacker uses its own SQLite file. Do not deploy yet:
   ```bash
   fly launch --copy-config --no-deploy
   ```
3. Create the volume in the same region (1 GB is plenty to start):
   ```bash
   fly volumes create feedbacker_data --size 1 --region <region>
   ```
4. Set the owner sign-in as secrets (use a long password):
   ```bash
   fly secrets set ADMIN_USERNAME=<username> ADMIN_PASSWORD=<password>
   ```
5. Deploy, then open `https://<app-name>.fly.dev/admin`:
   ```bash
   fly deploy
   ```

To update, pull the new code and run `fly deploy` again. Your data stays on the volume. To back it up, download the
folder with `fly ssh sftp shell` (`get /app/data/feedbacker.db`) or take a volume snapshot (`fly volumes snapshots`).
For your own domain, run `fly certs add feedback.example.com` and point its DNS at the app.

### Option C: Railway

Railway builds the `Dockerfile` from your GitHub repository on each push, so it deploys what is on GitHub, not what is
on your computer.

**Warning:** Attach the volume before you add forms. Without it, every deploy deletes all forms and responses.

**Warning:** Keep one replica. Each replica would have its own copy of the data.

1. In Railway, create a project: **Deploy from GitHub repo**, and pick this repository.
2. In the service's **Variables**, add `ADMIN_USERNAME` and `ADMIN_PASSWORD` (use a long password).
3. Attach a volume to the service with the mount path `/app/data`.
4. In **Settings → Networking**, select **Generate Domain** (or add your own domain). If Railway asks for a port, enter
   `3000`.
5. Open `https://<your-domain>/admin` and sign in.

To update, push to GitHub; Railway builds and deploys the new version, and the data stays on the volume. You do not
need the `RAILWAY_RUN_UID` variable: the container gives the volume to its own user at start, then runs without root
rights. The Dockerfile has no `VOLUME` line on purpose, because Railway rejects it.

Render and similar platforms work the same way: build the `Dockerfile`, set the two secrets, expose port `3000`, and
attach a persistent disk at `/app/data`.

### Option D: a plain server without Docker

1. Install Bun 1.4+ on the server.
2. Clone the repository, then run `bun install` and `bun run build`.
3. Make `.env`.
4. Run `bun run start` under a process manager (for example a systemd service) so it restarts after a crash or a reboot.
5. Put a reverse proxy with HTTPS in front of it (see Option A).

## Design system

All UI comes from the Feedbacker design system: `src/design/tokens.css`, `src/design/bundle.css` and the font files in
`src/design/fonts/` are copied from it unchanged. Solid components output the same class names and markup as its previews (`fb-btn`, `fb-input`,
`fb-choice`, `fb-theme-*`, `fbg--*`, ...). `src/app.css` holds only app layout glue and the custom-theme variables.
To update the look, copy the new `tokens.css` and `bundle.css` over the old ones; regenerate `shared/themes.data.ts`
from the system's `Themes.md` if themes change, and `shared/fonts.ts` from its `Fonts.md` if fonts change.
Dev themes are scoped to the owner chrome (`data-dev-theme` on the page wrapper), never around the form preview, so
the preview always matches what visitors see.

## How it works

```
server/      Hono app: owner sign-in, form API, public form API, static files
shared/      Code that the server and the browser both use
  schema.ts  Form document types, defaults and the check for saved forms
  logic.ts   Conditional visibility, pages and answer checks
  themes.ts  Theme palettes (light and dark), background list, custom themes, contrast math
  qr.ts      QR design: defaults, "match theme" colors, contrast warnings, checks for saved data
src/
  form/      Public form (FormView is also the editor preview)
  admin/     Dev mode: sign-in, form list, editor, inspector, share dialog, responses
scripts/     dev.ts starts the two dev servers
```

- **Data:** Each form is one JSON document in the `forms` table. Each response is one row in the `responses` table.
  Deleting a form also deletes its responses.
- **Rules:** A rule can use only answers to questions that come *earlier* in the form. This prevents loops.
  The same code (`shared/logic.ts`) runs in the browser and on the server. The server drops answers to hidden
  questions and checks that each visible required question has an answer.
- **Sign-in:** The server compares the username and password from `.env` in constant time. It sets a signed,
  `HttpOnly`, `SameSite=Strict` cookie for 7 days. After 5 failed attempts from one address, sign-in is locked for
  15 minutes.
- **Share links** have the form `/f/<id>`. The id is 10 random characters (60 bits).
- **Uploads:** only the owner can upload. The server checks the first bytes of each file, so only real PNG, JPEG,
  GIF, WebP, MP4 and WebM files are kept (SVG is refused because it can carry scripts). Files get random names under
  `/uploads/`. Videos are served with range requests, so Safari can play them.
- **Themes:** `shared/themes.ts` holds each theme as two palettes. `src/form/theme.css` turns them into CSS custom
  properties and draws the animated backgrounds with CSS only. The backgrounds use the theme colors, so any background
  fits any theme. A test (`shared/themes.test.ts`) checks WCAG AA contrast for every theme in both modes.
- **QR scan check:** the editor draws each design, decodes it with `jsqr` at 3 sizes (as a phone camera sees it)
  and shows "Scannable" only if it reads back the exact link. A logo switches error correction to the highest level
  (H). "Match theme" always uses the light palette, because phones read dark-on-light codes best.
- **CSV export:** text that starts with `=`, `+`, `-` or `@` gets a leading `'`, so spreadsheet apps do not run it as
  a formula.

### Known limits

- The session secret is stored in the data folder (`session.secret`). Changing `ADMIN_PASSWORD` signs every session out.
- Public form submissions have no spam protection (no rate limit or captcha).
- Behind a reverse proxy, the failed-sign-in count uses the proxy's address, so all visitors share one count.
- Rules compare option text. If you rename an option, check the rules that use it.
- Uploaded images stay on disk when you delete the image block or the form.

## Instructions for AI coding assistants

If a user asks you to set up, run or deploy this project, follow these steps in order.

1. Check the Bun version with `bun --version`. If Bun is missing or older than 1.4, tell the user how to install or
   upgrade it (`bun upgrade`). Do not continue on an older Bun.
2. Run `bun install`.
3. If `.env` does not exist, copy `.env.example` to `.env`. Ask the user for the owner username and password.
   The password must have at least 8 characters. Do not invent a password and do not show it in chat.
   Never commit `.env`. Never put the password in any other file.
4. Run `bun test` and `bun run typecheck`. Both must pass before you continue.
5. Local run: run `bun run build`, then `bun run start`. Tell the user to open `http://localhost:3000/admin`.
   For development, run `bun run dev` and use `http://localhost:5173/admin`.
6. Deploy: ask the user where to deploy, then follow [Deploy](#deploy). Make sure that:
   - the database folder `/app/data` (Docker) or the `DATABASE_PATH` folder is on persistent storage,
   - HTTPS is in front of the app,
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set as secrets on the platform, not in the repository.
7. Check the deploy: `GET /api/public/forms/does-not-exist` must return HTTP 404 with JSON, and `/admin` must show
   the sign-in page.

Rules for changes to the code:

- Use **Solid 1.9**. Test the editor's drag and drop fully before any move to Solid 2.
- In Solid components, do not destructure `props` (`({ title }) =>` breaks reactivity). Read `props.title`.
- Keep answer checks in `shared/logic.ts`. The server must never trust the browser.
- Drag and drop follows the design system's `DragAndDrop.md`: the pointer engine is `src/admin/dnd.ts`, the placement
  rules are `src/admin/moves.ts` (tested in `moves.test.ts`), and the motion is `src/admin/motion.ts`.
- To add a theme, add an entry to `THEMES` in `shared/themes.ts` (light and dark palette, font, corners, background).
  To add a background, add it to `BACKGROUNDS` and write its CSS in `src/form/theme.css` (use only theme tokens,
  `cq` units, and animate only `transform` and `opacity`). The contrast test must pass.
- Run `bun test` and `bun run typecheck` after each change.
