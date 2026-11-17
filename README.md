# OnAir UK — TV Guide, Streaming & Time Machine

A standalone, zero-build **UK & Ireland TV Guide, Free Streaming, Catch-Up, and Historical/Future Time Machine** web app supporting **Freeview, Sky, Virgin Media, BT / EE TV, Freesat, Pluto TV, and Tubi**.

- **Live Site (GitHub Pages):** https://analogbits.github.io/OnAir-UK-TV-Guide/
- **Repository:** https://github.com/analogbits/OnAir-UK-TV-Guide

---

## How to Use OnAir UK

### 1. TV Guide (Full 24-Hour EPG: `00:00–24:00`)
- **Select your Platform:** Choose **Freeview**, **Sky**, **Virgin Media**, **BT / EE TV**, **Freesat**, **Pluto TV**, or **Tubi** in the controls bar. Channel numbers update automatically (including Sky's separate `0101+` Radio numbering).
- **Select your Region:** Pick your UK or Ireland region (e.g., Northern Ireland, Ireland RTÉ/TG4, London, Scotland, Wales, North West, etc.) from the **Region** dropdown.
- **Filter *On Now*:** Filter channels by what is airing right now (`All`, `★ Favorites`, `🎄` active season, `Entertainment`, `Drama`, `Film`, `Sport`, `Documentary`, `News`, `Kids`, `Music`, `Radio`).
- **Navigate Days & Times:**
  - Use the **14-day date strip** (`-7` days to `+6` days) to browse catch-up and upcoming broadcasts.
  - Use the quick time buttons (**Now**, **Morning**, **Afternoon**, **Primetime**, **Late**) to jump across the full `00:00–24:00` timeline.
- **Programme Badges & Details:** Programmes show `LIVE`, `NEW`, or `R` (Repeat) tags. Click any programme card to open its detail modal with synopsis, **Cast & Crew**, **IMDb / Rotten Tomatoes** links, **Watch Live / Catch-Up** links, **Watchlist**, and **Reminders**.

### 2. Guide Mode Dropdown (Normal vs. Seasons & Holidays)
Located in the top header bar, the **Guide Mode** dropdown switches **Time Machine**, **What to Watch**, and **Streaming** between standard viewing and any seasonal/holiday theme — **without altering your TV Guide EPG**:
- `📺 Normal Viewing` — standard non-seasonal recommendations and Time Machine presets.
- `🔄 Auto` — automatically follows the current time of year.
- **7 Built-in Seasons & Holidays:** `🎄 Christmas (Nov 10 – Dec 31)`, `❄️ Winter (Jan 1 – Feb 10)`, `💘 Romance (Feb 11 – Feb 18)`, `🐣 Spring & Easter (Feb 19 – Apr 30)`, `☀️ Summer (May 1 – Aug 31)`, `🍂 Autumn (Sep 1 – Oct 15)`, and `🎃 Halloween (Oct 16 – Nov 9)`.

### 3. Time Machine (`1989 – Next Year`)
- Click **Time Machine** on the timeline toolbar to pick any past or future date using the **Year / Month** dropdowns, calendar grid, or quick presets (including seasonal holiday dates when in Seasonal Mode, plus *1 Year Ago*, *5 Years Ago*, *27 May 2020*, and *Live (Today)*).
- **Multi-Source Backups:** Automatically checks Sky EPG, Freeview, `tv24.co.uk`, **BBC Genome** (for classic/terrestrial BBC schedules), and **TVMaze (UK & IE)**.
- **Future Look-Ahead:** When browsing upcoming holiday/Christmas dates beyond `+6` days, the Time Machine banner surfaces available future schedules plus quick links to BBC Christmas & TV Radar.
- Click any **Today / Date Strip** pill (or **Exit Time Machine**) to return to live schedules.

### 4. Now & Next
- Switch to the **Now & Next** tab for a fast, channel-by-channel overview of what is on right now and up next across your selected TV platform and category.

### 5. What to Watch
- **Seasonal Spotlight** *(shown in Seasonal Mode)*: Live & upcoming seasonal programmes across UK TV, Pluto TV, Tubi, and On-Demand.
- **7-Day Watch Ahead:** Day-by-day picks (`Today` through `+6` days) with filters for **All Picks**, **📱 On Demand**, **✨ New & Premieres**, **🎬 Films**, **🎭 Drama**, **⚽ Sport**, **🌍 Docs**, and **📺 Entertainment**.
- **What to Watch This Week** & **Tailored Recommendations:** Filter by your saved **Interests**, format (**All / Live TV / Catch-Up / Streaming**), and minimum star rating (`1★–5★`).

### 6. Streaming & On-Demand Finder
- **Weekly Editor's Picks Carousel:** Rolling 10-show spotlight of top `4★–5★` titles (weighted with *What's New* buzz and active seasonal picks in Seasonal Mode). Hover to pause or use `‹` / `›` arrows.
- **Platform & Content Filters:** Filter across **Netflix, BBC iPlayer, ITVX, Channel 4, Prime Video, Disney+, Apple TV+, Sky / NOW, Paramount+, Pluto TV, Tubi, MUBI, and BFI Player**, by Type, Genre, Release Window (*This Week*, *Earlier This Month*), and Sort Order (*Rating*, *Year*, *Title*).

### 7. Global Search (`✨ New Shows` & Future Look-Ahead)
- Type any show, film, actor, or channel in the header search box:
  - **Filter Tabs:** `All`, `✨ New Shows` (genuinely new broadcasts & recent/upcoming streaming drops, excluding old Series 1 repeats), `Live & On Next`, `Past 7 Days`, and `Streaming`.
  - **Scope & Sync:** Toggle between `All Platforms` and your active platform, or click **🔄 Sync Upcoming Days** to pull `+1..+6` schedules into search.
  - **Future Episode Time Machine Jump:** When TVMaze finds an upcoming episode beyond `+6` days, the search card displays `📅 Upcoming: YYYY-MM-DD` with **`🕰️ Time Machine`** (jumps straight to that date), **`+ Watchlist`**, and **`🔔 Notify Me`**.
  - **Quick UK On-Demand Links:** One-click search pills for Netflix, Channel 4, BBC iPlayer, ITVX, Prime Video, Disney+, Pluto TV, and Tubi.

### 8. Reminders, Calendar Export & Watchlist
From any programme or search modal:
- **🔔 Notify Me:** Saves the reminder and requests Browser Notification permission; checks every minute while the app is open and triggers a native alert `0–10` minutes before air time.
- **📅 Add to Calendar (`.ics`):** Downloads a standard `.ics` calendar event so macOS/iOS/Google Calendar alerts you in the background even when your browser is closed.
- **✉️ Email Reminder:** Opens a pre-filled `mailto:` draft with the programme title, channel, and air time.
- **Watchlist:** Saved programmes and streaming items live in the slide-over **Watchlist** drawer (`Watchlist` button in the header).

### 9. Ask OnAir, What's New & Settings
- **What's New:** Live RSS entertainment & film news (BBC Entertainment, Guardian TV/Film, Digital Spy, What's on Netflix).
- **Ask OnAir (`💬`):** Built-in assistant for quick queries like *"what's on BBC One tonight"*, *"switch to Sky"*, or *"recommend a thriller"*.
- **Settings:**
  - **Display & Defaults:** System / Light / Dark theme, default platform, auto-refresh interval, **Low-Data Mode** (2h cache TTL), and **Custom CORS Relay** URL.
  - **Storage & Compression:** Live EPG schedules (`epg_cache_24h`) and the Show Vault (up to **25,000 shows**) are stored in **IndexedDB compressed with native `gzip`** (`CompressionStream`), freeing up `localStorage` quota.
  - **Backups & Debug:** Export/Import Watchlist & Preferences JSON, download an updated `vault_data.js`, or enable **Debug Mode (`🛠️`)** to inspect live network requests and response times.

---

## Running Locally & Updating Data

### Local Development Server (with Built-in CORS Proxy)
```bash
python3 server.py
```
Then open `http://127.0.0.1:8765` in your browser. `server.py` serves static files and provides `/api/proxy?url=...` with a 30-minute cache for local development.

### Updating `vault_data.js`
- **Locally:** Run `python3 update_vault.py` (Python 3 standard library only).
- **In Browser:** Open **Settings → Download Updated `vault_data.js`**.
- **GitHub Actions:** Copy `github-action-update-vault.yml` to `.github/workflows/update-vault.yml` to refresh `vault_data.js` daily at `06:15 UTC`.

### Enabling GitHub Pages
1. Go to **Settings → Pages** in `https://github.com/analogbits/OnAir-UK-TV-Guide`.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Select branch `main` and folder `/ (root)`, then click **Save**.

---

## Changelog

### 2026-11-17 — 24h Guide, Pluto/Tubi Fixes, Compression, QoL & Guide Mode
- **QoL & Full Persistence Audit** — Added EPG **Channel Filter** (`Name or Ch #`), **Overnight (`00:00`)** timeline jump button, Search **`🎬 Films`** filter tab, inline **`+ Watchlist` / `🔔 Remind`** actions on Search TV cards, multi-day modal lookup (`findProgrammeById`), keyboard shortcuts (`/` for Search, `N` for Now), IndexedDB cache wiring for Search, and migration of legacy `rt_*` keys (`watchlist`, `favorites`, `platform`, `reminders`) to `onair_*`.
- `a62edac` — Extended Time Machine minimum year back to **1989** (`1989 – Next Year`).
- `e229bb9` — Hid the seasonal category pill in `Normal Viewing` and updated it dynamically per active season.
- `3432d1b` — Updated `README.md` with full user guide, architecture details, and complete version changelog.
- `f56e295` — Fixed Pluto TV & Tubi genre classification (`classifyFastGenre`) so TV series (*Charmed*, *The Walking Dead*, *JAG*, *Farscape*, *Andromeda*, *Z Nation*, *Six Million Dollar Man*, etc.) are classified as `Drama`/`Entertainment` instead of `Film`, and bumped `pluto_v2_` / `tubi_v2_` caches.
- `1fcd9e2` — Added **Pluto TV** and **Tubi** to Streaming platform filters and merged live Pluto/Tubi titles into **Streaming** and **What to Watch**.
- `88da9e5` — Fixed Pluto TV & Tubi `sid` mismatch (`pluto-`/`tubi-` prefix) that caused `"Fetching live schedule..."` to hang, and started Pluto queries at `00:00`.
- `9f6aab5` — Tightened Search `✨ New Shows` filter to exclude old *Series 1* repeats and older archive titles.
- `3666334` — Enabled full **24-hour TV Guide (`00:00–24:00`)** (`START_HOUR = 0`, `epg_cache_24h`) so overnight broadcasts appear accurately after midnight.
- `dcb9454` — Added `✨ New Shows` filter tab to global Search.
- `4e8d5df` — Kept a single **Guide Mode** dropdown in the top header bar.
- `575b7af` — Upgraded EPG & Show Vault storage to **gzip-compressed IndexedDB** (`onair_uk_db_v1`), raised Show Vault cap to **25,000** shows, streaming catalogue to **700** titles, RSS feeds to **15** items, and What to Watch / Search display limits.
- `9a8cce9` — Replaced the Normal/Seasonal toggle with a full **Season & Holiday dropdown** (`Normal Viewing`, `Auto`, and all 7 seasons/holidays) and fixed `valentines` Time Machine presets.
- `7c44ac6` / `a0672c9` — Made Normal/Seasonal mode switch **Time Machine**, **What to Watch**, and **Streaming** together while leaving the **TV Guide** grid untouched.
- `d806acd` — Added future episode **Time Machine** jump in Search (`_links.nextepisode`), fixed `"onair_reminders"` storage key mismatch, and added **Browser Notifications (`🔔`)**, **Calendar export (`.ics`)**, and **Email reminder (`mailto:`)**.

### 2026-11-16 — Time Machine, Cast & Crew Failover, Regions & Mobile Polish
- `326eb12` — Added Normal/Seasonal quick toggle and dynamic seasonal Time Machine presets.
- `c21ba06` — Added BBC Christmas and TV Radar links to December Time Machine banner.
- `b6db94b` — Checked Sky, Freeview, `tv24.co.uk`, BBC Genome & TVMaze for future/Christmas Time Machine dates.
- `d7a8a61` — Enriched Time Machine modals with real show/film synopses and guarded stale modal updates.
- `fdb6b00` — Added **4-tier Cast & Crew failover** (TVMaze exact + fuzzy search + Wikipedia infobox + Wikidata SPARQL).
- `2c4cecd` / `b0d0278` — Separated Sky Radio (`0101+`) from TV (`101+`) with leading-zero preservation and added film Cast & Director lookup.
- `aa2a600` — Added on-demand Cast & Crew lookup to programme detail modals.
- `660c074` / `11ad544` / `d587695` / `03fd288` — Added **Rolling 10-Show Weekly Editor's Picks** hero carousel balanced across 5-star and 4-star titles + *What's New* buzz, plus multi-region Time Machine fill.
- `daa993c` — Included **On-Demand & Streaming** picks in **Watch Ahead** for every upcoming day.
- `0fca40d` — Fixed Time Machine calendar popover and full mobile portrait layout.
- `fe1c50c` / `764b168` / `f0a5478` / `b1f798e` / `6d002f0` — Configured Cloudflare Worker CORS relay, added 15s refresh cooldowns, `tv24.co.uk` failover across all dates, and Custom CORS Relay setting.
- `bfee1cf` / `9c40bef` — Added **Debug Mode** data pull inspector and live console.
- `b13e1c6` / `66ec2fc` / `701cca9` / `c25724d` / `958181b` / `a7007c5` / `ae06535` — Integrated **BBC Genome** Next.js JSON API for historical BBC terrestrial schedules with staggered fetches and automatic Time Machine exit on date strip clicks.
- `6e3b40b` / `00f8cde` / `3a3f024` / `b96b83c` — Improved Time Machine TVMaze UK+IE fallback matching and fixed `escapeHtml` scope & popover bounds.
- `45a458f` — Added Radio Times-style **7-Day Watch Ahead** picks in What to Watch.
- `bd4f097` / `b5a7424` — Added **Time Machine** TV Guide with Year/Month dropdowns, quick presets, and `tv24.co.uk` single-day backup.
- `bfc71cc` / `d3c2249` — Added **UK & Ireland Region selector** (NI, IE RTÉ/TG4, UK regions) and widened EPG channel column.
- `21195c3` — Refreshed Pluto/Tubi UK snapshot and enabled Today snapshot fallback.

### 2026-11-15 — Initial Release, Live UK EPG, Pluto/Tubi, Search & Vault
- `3e6fe78` / `c88a802` / `d9f8d3d` — Added `New` vs `Repeat` broadcast status badges enriched via TVMaze GB across EPG, modals, search, and chatbot.
- `d20dfb1` / `7884233` / `ca773bc` / `c1e64ea` / `34c052a` — Built multi-day ahead/back fuzzy **Search**, UK On-Demand search pills, and the **Ask OnAir** assistant.
- `f3bdd12` / `a4a1193` / `35cecf0` — Fixed Pluto TV evening timeline truncation via sliding/split windows and snapshot prefill handling.
- `97431e1` — Added anti-burst rate limiting, Low-Data mode, failsafes, and expanded Settings.
- `698abc7` / `3767a93` / `afe3d5d` / `eac4901` / `eaffd68` — Added verified UK Pluto TV & Tubi channel seeds, live EPG snapshots, `server.py` 30-min proxy cache, and GitHub Actions vault workflow.
- `a3d9d18` / `2180d35` / `55ad094` / `0cbc179` — Integrated **Pluto TV** & **Tubi** live UK EPG and 365-day auto-updating Seasonal Spotlight.
- `49016a7` / `3e9f325` / `4934ba9` / `62bec2e` — Added direct **Watch Live** stream links (including NOW TV `/watch/playback/live/<sid>` and Sky Go).
- `fbdf630` / `c7c6d15` / `53d8efe` — Added full **BT / EE TV** Sky channel numbers and collision resolution.
- `22b5e7f` / `bebf0a5` / `6236248` — Bundled 155-channel past-7-day UK EPG (`past_epg_data.js`), Freeview 165-channel backup, and initial README.
- `33db8e7` — Initial commit: **OnAir UK TV Guide & Streaming**.
