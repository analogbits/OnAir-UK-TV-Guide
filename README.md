# OnAir UK — TV Guide & Streaming

A standalone, zero-build UK TV Guide, Streaming Discovery, and Catch-Up web app for **Freeview**, **Sky**, **Virgin Media**, **BT / EE TV**, and **Freesat**.

- **Live Site (GitHub Pages):** https://analogbits.github.io/OnAir-UK-TV-Guide/
- **Repository:** https://github.com/analogbits/OnAir-UK-TV-Guide

---

## Features

- **14-Day UK TV Guide (`-7` to `+6` days):** Live schedules for Today + Next 6 Days via Sky EPG, plus **Last 7 Days** catch-up schedules backed by Sky EPG (Yesterday) and Freeview UK's 165-channel API / TVMaze UK. Past days already loaded are reused from local storage without re-fetching.
- **On Now Filtering:** Filter the TV Guide and **Now & Next** by what is actually airing right now (`Film`, `Drama`, `Entertainment`, `Sport`, `Documentary`, `News`, `Kids`, `Music`, `Radio`, or `★ Favorites`).
- **What to Watch:** Personalised recommendations across live TV, catch-up, and streaming with star rating (`1★–5★`) and genre/interest filters (`World Cinema & International TV`, `Cult Classics & Indie`, `Prestige Drama`, etc.).
- **Streaming Catalogue:** Releases from **This Week**, **Earlier This Month**, and curated picks across Netflix, BBC iPlayer, ITVX, Channel 4, Prime Video, Disney+, Apple TV+, Sky / NOW, Paramount+, MUBI, and BFI Player.
- **Direct Watch Links + IMDb & Rotten Tomatoes:** Click any show or film for direct platform/show links, IMDb star ratings (`/10`), and Rotten Tomatoes Tomatometer (`%`) links.
- **Persistent Show Vault (`vault_data.js` + `localStorage`):** Categories, IMDb/RT IDs, scores, and direct links are stored once and reused across sessions (up to 5,000 shows / ~5 MB browser storage), while only live TV schedules, What's On, and episode descriptions update live.
- **Multi-Tier Backups:** Automatic fallbacks across Sky EPG → Freeview UK → TVMaze UK → local cache, and `rss2json` → `allorigins.win` → `corsproxy.io` → local cache for news feeds.
- **First-Time Setup Wizard & Settings:** Choose your TV platform (required), optionally pick genres/channels/shows, configure auto-refresh intervals, export/import backups, and match your system Light/Dark theme automatically.
- **Responsive Design:** Works on desktop, laptop, tablet, and mobile phones.

---

## Enabling GitHub Pages

1. Go to **Settings → Pages** in `https://github.com/analogbits/OnAir-UK-TV-Guide`.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Select branch **`main`** and folder **`/ (root)`**, then click **Save**.
4. Your site will be live at **https://analogbits.github.io/OnAir-UK-TV-Guide/**.

---

## Updating `vault_data.js`

- **Locally:** Run `python3 update_vault.py` in the project folder to update `vault_data.js` using only the Python 3 standard library.
- **In the Browser:** Open the **Settings** tab and click **Download Updated `vault_data.js`**.
- **Automated Daily on GitHub:** Copy `github-action-update-vault.yml` into `.github/workflows/update-vault.yml` via the GitHub **Actions** tab to refresh and commit `vault_data.js` daily at `06:15 UTC`.
