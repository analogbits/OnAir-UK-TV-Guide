#!/usr/bin/env python3
"""
OnAir UK — Persistent Show & Streaming Vault Updater
Fetches new UK/Global streaming releases, IMDb IDs/ratings, and Rotten Tomatoes slugs
once, and merges them into vault_data.js in the same folder for GitHub & offline reuse.
Uses only Python 3 standard library.
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
VAULT_FILE = os.path.join(HERE, "vault_data.js")

WEB_CHANNEL_MAP = {
    "netflix": {"name": "Netflix", "color": "#e50914"},
    "bbc iplayer": {"name": "BBC iPlayer", "color": "#ff4c98"},
    "itvx": {"name": "ITVX", "color": "#2563eb"},
    "itv hub": {"name": "ITVX", "color": "#2563eb"},
    "channel 4": {"name": "Channel 4", "color": "#1d4ed8"},
    "all 4": {"name": "Channel 4", "color": "#1d4ed8"},
    "prime video": {"name": "Prime Video", "color": "#00a8e1"},
    "amazon prime video": {"name": "Prime Video", "color": "#00a8e1"},
    "disney+": {"name": "Disney+", "color": "#0063e5"},
    "apple tv+": {"name": "Apple TV+", "color": "#1d1d1f"},
    "apple tv": {"name": "Apple TV+", "color": "#1d1d1f"},
    "now": {"name": "Sky / NOW", "color": "#0f766e"},
    "sky go": {"name": "Sky / NOW", "color": "#0f766e"},
    "paramount+": {"name": "Paramount+", "color": "#0064ff"},
    "mubi": {"name": "MUBI", "color": "#1e293b"},
    "bfi player": {"name": "BFI Player", "color": "#be123c"},
}

DAY_OFFSETS = [0, -1, -2, -3, -4, -5, -6, -7, -10, -14, -18, -21, -25, -28]


def fetch_json(url, timeout=15):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "OnAirUK-VaultUpdater/1.0 (+https://github.com)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def strip_html(text):
    if not text:
        return ""
    clean = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", clean).strip()


def normalize_title_key(title):
    s = re.sub(r"^Film:\s*", "", str(title or ""), flags=re.I)
    s = re.sub(r"\s*\(.*?\)\s*", " ", s)
    s = re.sub(r"\s*:\s*Series\s*\d+.*$", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip().lower()


def normalize_direct_url(url):
    if not url:
        return None
    m = re.search(r"bbc\.co\.uk/programmes/([a-z0-9]+)", url, flags=re.I)
    if m:
        return f"https://www.bbc.co.uk/iplayer/episodes/{m.group(1)}"
    return url


def infer_interests(title, summary, genre):
    text = f"{title} {summary}".lower()
    out = []
    if genre == "Drama":
        out.append("Prestige Drama")
    if genre == "Comedy":
        out.append("Comedy & Sitcoms")
    if genre == "Sport":
        out.append("Live Sport")
    if genre == "Documentary":
        out.append("True Crime & Documentaries")
    if re.search(r"crime|murder|detective|police|thriller|killer|mystery", text):
        out.append("Crime & Thrillers")
    if re.search(r"sci-fi|space|alien|future|star trek|doctor who|fantasy|dragon", text):
        out.append("Sci-Fi & Fantasy")
    if re.search(r"history|art|bbc four|world|culture|symphony|opera|museum", text):
        out.append("Arts, History & Culture")
    if re.search(r"french|italian|spanish|korean|japanese|subtitled|foreign", text):
        out.append("World Cinema & International TV")
    return list(dict.fromkeys(out))


def load_existing_vault():
    if not os.path.exists(VAULT_FILE):
        return {"updatedAt": None, "shows": {}, "streaming": []}
    try:
        with open(VAULT_FILE, "r", encoding="utf-8") as f:
            raw = f.read().strip()
        prefix = "window.ONAIR_VAULT_DATA = "
        if raw.startswith(prefix):
            raw = raw[len(prefix) :].rstrip("; \n\r")
        data = json.loads(raw)
        return {
            "updatedAt": data.get("updatedAt"),
            "shows": data.get("shows", {}),
            "streaming": data.get("streaming", []),
        }
    except Exception as exc:
        print(f"Warning: could not parse existing vault ({exc}); starting fresh.")
        return {"updatedAt": None, "shows": {}, "streaming": []}


def lookup_rt_slug_wikidata(imdb_id):
    sparql = f'SELECT ?rtId WHERE {{ ?item wdt:P345 "{imdb_id}". OPTIONAL {{ ?item wdt:P1258 ?rtId. }} }} LIMIT 1'
    url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(sparql)
    try:
        res = fetch_json(url, timeout=12)
        bindings = res.get("results", {}).get("bindings", [])
        if bindings and bindings[0].get("rtId", {}).get("value"):
            return bindings[0]["rtId"]["value"]
    except Exception:
        pass
    return None


def main():
    vault = load_existing_vault()
    shows_vault = vault["shows"]
    prev_streaming = {item["id"]: item for item in vault.get("streaming", []) if item.get("id")}

    today = datetime.now(timezone.utc).date()
    new_streaming = {}
    rt_lookups_done = 0

    for offset in DAY_OFFSETS:
        d_str = (today + timedelta(days=offset)).isoformat()
        is_this_week = abs(offset) <= 7
        combined = []
        for endpoint in (
            f"https://api.tvmaze.com/schedule/web?country=GB&date={d_str}",
            f"https://api.tvmaze.com/schedule/web?date={d_str}",
        ):
            try:
                combined.extend(fetch_json(endpoint))
            except Exception:
                pass

        for ep in combined:
            show = (ep.get("_embedded") or {}).get("show") or ep.get("show")
            if not show or not show.get("webChannel"):
                continue
            wc_name = (show["webChannel"].get("name") or "").lower().strip()
            mapped = WEB_CHANNEL_MAP.get(wc_name)
            if not mapped:
                continue

            item_id = f"live-st-{show['id']}"
            if item_id in new_streaming:
                continue

            genres = show.get("genres") or []
            genre_raw = genres[0] if genres else "Drama"
            genre = "Drama"
            if re.search(r"comedy", genre_raw, re.I):
                genre = "Comedy"
            elif re.search(r"thriller|crime|mystery", genre_raw, re.I):
                genre = "Thriller"
            elif re.search(r"sci-fi|science|fantasy", genre_raw, re.I):
                genre = "Sci-Fi"
            elif re.search(r"doc", genre_raw, re.I):
                genre = "Documentary"
            elif re.search(r"sport", genre_raw, re.I):
                genre = "Sport"

            imdb_id = (show.get("externals") or {}).get("imdb")
            score10 = (show.get("rating") or {}).get("average")
            direct_url = normalize_direct_url(show.get("officialSite") or show.get("url"))
            img = (show.get("image") or {}).get("medium")
            title = show.get("name") or "Untitled"
            v_key = normalize_title_key(title)

            existing = shows_vault.get(v_key, {})
            rt_slug = existing.get("rtSlug")

            # Only query Wikidata once for newly seen shows with an IMDb ID (cap per run to stay polite)
            if imdb_id and "rtSlug" not in existing and rt_lookups_done < 25:
                rt_slug = lookup_rt_slug_wikidata(imdb_id)
                rt_lookups_done += 1
                time.sleep(0.15)

            now_ms = int(time.time() * 1000)
            if v_key:
                shows_vault[v_key] = {
                    "category": existing.get("category") or genre,
                    "directUrl": direct_url or existing.get("directUrl"),
                    "tvmazeUrl": show.get("url") or existing.get("tvmazeUrl"),
                    "imdbId": imdb_id or existing.get("imdbId"),
                    "rtSlug": rt_slug if rt_slug is not None else existing.get("rtSlug"),
                    "score10": score10 or existing.get("score10"),
                    "image": img or existing.get("image"),
                    "rating": min(5, max(3, round(score10 / 2))) if score10 else existing.get("rating"),
                    "savedAt": now_ms,
                }

            new_streaming[item_id] = {
                "id": item_id,
                "title": title,
                "platform": mapped["name"],
                "platformColor": mapped["color"],
                "type": "Documentaries" if re.search(r"doc", show.get("type") or "", re.I) else "TV Series",
                "genre": genre,
                "year": int(show["premiered"][:4]) if show.get("premiered") else today.year,
                "seasons": f"Season {ep['season']} ({d_str})" if ep.get("season") else f"Released {d_str}",
                "rating": min(5, max(3, round(score10 / 2))) if score10 else 4,
                "imdbId": imdb_id,
                "imdbScore": f"{float(score10):.1f}" if score10 else None,
                "rtSlug": rt_slug,
                "age": "15",
                "isLiveData": True,
                "thisWeek": is_this_week,
                "releaseWindow": "This Week" if is_this_week else "Last 30 Days",
                "interests": infer_interests(title, show.get("summary") or "", genre),
                "image": img,
                "officialSite": direct_url,
                "cast": ", ".join(genres) if genres else (show.get("type") or "Streaming"),
                "desc": strip_html(ep.get("summary") or show.get("summary"))
                or f'New episode "{ep.get("name") or ""}" streaming on {mapped["name"]}.',
            }

    # Merge new streaming items with previously stored ones (cap at 350)
    merged_streaming = dict(new_streaming)
    for k, v in prev_streaming.items():
        if k not in merged_streaming:
            v["thisWeek"] = False
            v["releaseWindow"] = "Last 30 Days"
            merged_streaming[k] = v
    streaming_list = list(merged_streaming.values())[:350]

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "shows": shows_vault,
        "streaming": streaming_list,
    }

    with open(VAULT_FILE, "w", encoding="utf-8") as f:
        f.write("window.ONAIR_VAULT_DATA = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(
        f"Updated {VAULT_FILE}: {len(shows_vault)} shows in vault, "
        f"{len(streaming_list)} streaming items ({rt_lookups_done} new RT lookups)."
    )


if __name__ == "__main__":
    main()
