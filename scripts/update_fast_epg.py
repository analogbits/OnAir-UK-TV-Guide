#!/usr/bin/env python3
"""
Fetches real live Pluto TV UK and Tubi UK EPG schedules for today
and writes fast_epg_snapshot.js (used as same-origin fallback when browser CORS blocks direct API calls).
"""

import datetime
import json
import re
import urllib.request


def map_pluto_cat(cat, name):
    t = f"{cat or ''} {name or ''}".lower()
    if any(k in t for k in ["movie", "film", "cinema", "thriller", "horror", "action", "sci-fi", "western", "romance", "christmas"]):
        return "Film"
    if any(k in t for k in ["sport", "fight", "wrestling", "football", "pga", "poker", "darts"]):
        return "Sport"
    if any(k in t for k in ["news", "bbc", "sky", "euronews", "cnn"]):
        return "News"
    if any(k in t for k in ["kid", "nick", "cartoon", "anime", "teen"]):
        return "Kids"
    if any(k in t for k in ["music", "mtv", "vh1", "concert", "hits"]):
        return "Music"
    if any(k in t for k in ["doc", "history", "nature", "science", "crime", "mystery", "earth", "travel"]):
        return "Documentary"
    if any(k in t for k in ["drama", "soap", "detective", "police", "csi", "law"]):
        return "Drama"
    return "Entertainment"


def map_tubi_cat(cat, name):
    t = f"{cat or ''} {name or ''}".lower()
    if any(k in t for k in ["movie", "film", "cinema", "horror", "action", "sci-fi", "western", "thriller"]):
        return "Film"
    if any(k in t for k in ["sport", "uefa", "nfl", "nba", "pga", "racing", "motorsport", "poker", "combat", "wrestling"]):
        return "Sport"
    if any(k in t for k in ["news", "weather", "bloomberg", "euronews", "fox", "nbc", "abc"]):
        return "News"
    if any(k in t for k in ["kid", "family", "cartoon", "anime"]):
        return "Kids"
    if any(k in t for k in ["music", "concert", "qello"]):
        return "Music"
    if any(k in t for k in ["doc", "crime", "mystery", "history", "science", "nature"]):
        return "Documentary"
    if any(k in t for k in ["drama", "tv drama"]):
        return "Drama"
    return "Entertainment"


def iso_to_mins(iso_str, midnight_ts):
    dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return round((dt.timestamp() - midnight_ts) / 60)


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = midnight + datetime.timedelta(hours=24)
    midnight_ts = midnight.timestamp()
    date_str = midnight.strftime("%Y%m%d")

    # 1. Pluto TV UK (fetch two windows so Pluto's per-channel timeline cap doesn't truncate evening shows)
    pluto_windows = [
        (midnight + datetime.timedelta(hours=6), midnight + datetime.timedelta(hours=15)),
        (midnight + datetime.timedelta(hours=14), midnight + datetime.timedelta(hours=23, minutes=59, seconds=59)),
    ]
    pluto_by_id = {}
    for w_start, w_end in pluto_windows:
        pluto_url = (
            f"https://api.pluto.tv/v2/channels?start={urllib.parse.quote(w_start.isoformat())}"
            f"&stop={urllib.parse.quote(w_end.isoformat())}"
        )
        chunk_raw = json.loads(
            urllib.request.urlopen(urllib.request.Request(pluto_url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode()
        )
        for ch in chunk_raw:
            if not ch or not ch.get("_id") or not ch.get("name"):
                continue
            existing = pluto_by_id.get(ch["_id"])
            if not existing:
                pluto_by_id[ch["_id"]] = ch
            else:
                existing["timelines"] = (existing.get("timelines") or []) + (ch.get("timelines") or [])

    pluto_channels = []
    pluto_schedules = {}
    for ch in pluto_by_id.values():
        cid = f"pluto-{ch['_id']}"
        genre = map_pluto_cat(ch.get("category"), ch.get("name"))
        pluto_channels.append({
            "id": cid,
            "sid": cid,
            "name": ch["name"],
            "short": re.sub(r"[^A-Za-z0-9]", "", ch["name"])[:5].upper() or "PLUTO",
            "category": genre,
            "plutoSlug": ch.get("slug") or ch["_id"],
            "num": ch.get("number") or 0,
        })
        events = []
        seen_tl = set()
        for idx, tl in enumerate(ch.get("timelines") or []):
            if not tl.get("start") or not tl.get("stop"):
                continue
            tl_key = (tl.get("_id") or "", tl["start"])
            if tl_key in seen_tl:
                continue
            seen_tl.add(tl_key)
            s_min = max(0, iso_to_mins(tl["start"], midnight_ts))
            e_min = min(24 * 60, iso_to_mins(tl["stop"], midnight_ts))
            if e_min <= s_min:
                continue
            ep = tl.get("episode") or {}
            events.append({
                "id": f"pluto-{ch['_id']}-{tl.get('_id', idx)}",
                "title": tl.get("title") or ep.get("name") or ch["name"],
                "desc": ep.get("description") or (ep.get("series") or {}).get("description") or "",
                "genre": genre,
                "rating": ep.get("rating") or "All Ages",
                "isNew": False,
                "isLiveData": True,
                "startMin": s_min,
                "endMin": e_min,
            })
        if events:
            events.sort(key=lambda e: e["startMin"])
            pluto_schedules[cid] = events

    # 2. Tubi UK
    html = urllib.request.urlopen(
        urllib.request.Request("https://tubitv.com/live", headers={"User-Agent": "Mozilla/5.0"}), timeout=20
    ).read().decode("utf-8", "ignore")
    m = re.search(r"window\.__data\s*=\s*(\{[\s\S]*?\});?\s*</script>", html)
    data = json.loads(re.sub(r"\bundefined\b", "null", m.group(1)))
    containers = data.get("epg", {}).get("contentIdsByContainer", {}).get("tubitv_us_linear", [])
    seen = set()
    id_list = []
    cat_by_id = {}
    for c in containers:
        cname = c.get("name") or ""
        for cid in c.get("contents", []):
            sid = str(cid)
            if sid not in seen:
                seen.add(sid)
                id_list.append(sid)
                cat_by_id[sid] = cname

    tubi_rows = []
    for i in range(0, len(id_list), 20):
        chunk = id_list[i:i + 20]
        u = f"https://epg.production-public.tubi.io/content/epg/programming?platform=web&content_id={','.join(chunk)}"
        res = json.loads(
            urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode()
        )
        tubi_rows.extend(res.get("rows", []))

    tubi_channels = []
    tubi_schedules = {}
    for idx, r in enumerate(tubi_rows):
        raw_id = str(r.get("content_id") or "")
        title = r.get("title") or ""
        if not raw_id or not title:
            continue
        cid = f"tubi-{raw_id}"
        genre = map_tubi_cat(cat_by_id.get(raw_id, ""), title)
        tubi_channels.append({
            "id": cid,
            "sid": cid,
            "name": title,
            "short": re.sub(r"[^A-Za-z0-9]", "", title)[:5].upper() or "TUBI",
            "category": genre,
            "tubiId": raw_id,
            "num": idx + 1,
        })
        events = []
        for p_idx, p in enumerate(r.get("programs") or []):
            if not p.get("start_time") or not p.get("end_time"):
                continue
            s_min = max(0, iso_to_mins(p["start_time"], midnight_ts))
            e_min = min(24 * 60, iso_to_mins(p["end_time"], midnight_ts))
            if e_min <= s_min:
                continue
            events.append({
                "id": f"tubi-{raw_id}-{p.get('id', p_idx)}",
                "title": p.get("title") or title,
                "desc": p.get("description") or "",
                "genre": genre,
                "rating": "All Ages",
                "isNew": False,
                "isLiveData": True,
                "startMin": s_min,
                "endMin": e_min,
            })
        if events:
            tubi_schedules[cid] = events

    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    seed_out = (
        f"// Auto-generated verified UK channel directory for Pluto TV ({len(pluto_channels)}) and Tubi ({len(tubi_channels)})\n"
        f"window.ONAIR_FAST_SEED = {{\n"
        f"  pluto: {json.dumps(pluto_channels, ensure_ascii=False)},\n"
        f"  tubi: {json.dumps(tubi_channels, ensure_ascii=False)}\n"
        f"}};\n"
    )
    with open(os.path.join(root, "fast_channels_seed.js"), "w", encoding="utf-8") as f:
        f.write(seed_out)

    snap_out = (
        f"// Auto-generated live Pluto TV & Tubi UK EPG snapshot for {date_str}\n"
        f"window.ONAIR_FAST_EPG_SNAPSHOT = {{\n"
        f'  dateStr: "{date_str}",\n'
        f'  generatedAt: "{now.isoformat()}",\n'
        f"  plutoSchedules: {json.dumps(pluto_schedules, ensure_ascii=False)},\n"
        f"  tubiSchedules: {json.dumps(tubi_schedules, ensure_ascii=False)}\n"
        f"}};\n"
    )
    with open(os.path.join(root, "fast_epg_snapshot.js"), "w", encoding="utf-8") as f:
        f.write(snap_out)
    print(f"Updated fast_channels_seed.js & fast_epg_snapshot.js for {date_str}: {len(pluto_schedules)} Pluto schedules, {len(tubi_schedules)} Tubi schedules")


if __name__ == "__main__":
    main()
