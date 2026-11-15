/* ==========================================================================
   OnAir UK — 100% Live UK TV EPG & Streaming Refresh Engine
   Sources (All Live, Zero Fake Schedules):
     1. Sky EPG Services API (awk.epgsky.com/hawk/linear/services/4101/1)
     2. Sky EPG Linear Schedule API (awk.epgsky.com/hawk/linear/schedule/YYYYMMDD/...)
     3. TVMaze UK & Global Web Streaming Schedule API
     4. What's on Netflix UK RSS & The Guardian TV & Radio RSS (via rss2json)
   ========================================================================== */

const ONAIR_LIVE = (() => {
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const CHANNELS_TTL_MS = 24 * 60 * 60 * 1000;   // 24h for UK channel lineup
  const STREAMING_TTL_MS = 12 * 60 * 60 * 1000; // 12h for streaming drops
  const RSS_TTL_MS = 2 * 60 * 60 * 1000;        // 2h for news/RSS feeds
  const VAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for reusable show metadata & links
  const STORAGE_KEY = "onair_live_epg_v6";
  const VAULT_STORAGE_KEY = "onair_show_vault_v1";

  // Sky service genre (sg) -> OnAir category
  const SG_TO_CATEGORY = {
    3: "Entertainment",
    6: "Film",
    7: "Sport",
    5: "News",
    4: "Kids",
    9: "Documentary",
    8: "Music",
    12: "Radio",
    14: "Entertainment", // Shopping/Lifestyle
    15: "Entertainment", // International
    16: "Documentary"    // Religion/Specialist
  };

  // Sky event genre (eg) -> base Programme genre
  const EG_TO_GENRE = {
    1: "Entertainment",
    2: "Kids",
    3: "Entertainment",
    4: "Music",
    5: "Documentary",
    6: "Film",
    7: "Sport",
    8: "Entertainment",
    9: "Documentary",
    10: "Drama"
  };

  function mapTvmazeShowToCategory(show) {
    if (!show) return null;
    const type = (show.type || "").toLowerCase();
    const genres = (show.genres || []).map((g) => g.toLowerCase());
    if (type === "news") return "News";
    if (type === "sports") return "Sport";
    if (type === "documentary") return "Documentary";
    if (type === "talk show" || type === "variety" || type === "reality" || type === "game show") {
      return "Entertainment";
    }
    if (type === "animation") {
      return genres.includes("children") || genres.includes("family") ? "Kids" : "Comedy";
    }
    if (type === "scripted") {
      if (genres.includes("comedy")) return "Comedy";
      return "Drama";
    }
    return null;
  }

  async function fetchTvmazeUkMap(isoDate, cache) {
    const cacheKey = `tvmaze_gb_${isoDate}`;
    if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL_MS * 8) {
      return cache[cacheKey].map || {};
    }
    try {
      const list = await fetchJson(`https://api.tvmaze.com/schedule?country=GB&date=${isoDate}`);
      const map = {};
      (Array.isArray(list) ? list : []).forEach((ep) => {
        const show = ep && ep.show;
        if (!show || !show.name) return;
        const cat = mapTvmazeShowToCategory(show);
        if (cat) {
          map[normalizeTitleKey(show.name)] = cat;
        }
      });
      cache[cacheKey] = { ts: Date.now(), map };
      saveCache(cache);
      return map;
    } catch {
      return {};
    }
  }

  function classifyProgrammeGenre(ev, channelCategory, tvmazeMap = {}) {
    const title = ev.t || "";
    const sy = ev.sy || "";

    // 1. Check TVMaze UK official broadcast classification by title
    const cleanKey = normalizeTitleKey(title.replace(/^Live:\s*/i, "").replace(/^New:\s*/i, ""));
    if (cleanKey && tvmazeMap[cleanKey]) {
      return tvmazeMap[cleanKey];
    }

    // 2. Sky exact (eg, esg) event genre + sub-genre codes
    if (ev.eg === 6 || /\b(feature film|sci-fi action film|animated film|comedy film|thriller film|horror film)\b/i.test(sy)) {
      return "Film";
    }
    if (ev.eg === 7 || /\b(live .*football|premier league|champions league|cricket|golf|formula 1|grand prix|tennis|rugby|darts|snooker|boxing|racing|motogp|nfl|nba|match of the day)\b/i.test(title)) {
      return "Sport";
    }
    if (channelCategory === "Kids" || ev.eg === 2) {
      return "Kids";
    }
    if (channelCategory === "Music" || ev.eg === 4) {
      return "Music";
    }
    if (
      channelCategory === "News" ||
      (ev.eg === 5 && ev.esg === 8) ||
      /\b(bbc news|sky news|itv news|channel 4 news|5 news|gb news|world news|weather|newsround|question time|newsnight|laura kuenssberg|sunday morning live|politics london|westminster|parliament|pmqs|bbc breakfast|good morning britain)\b/i.test(title)
    ) {
      return "News";
    }
    if (
      ev.eg === 3 &&
      (ev.esg === 2 || ev.esg === 8 || /\b(frasier|friends|the simpsons|family guy|big bang theory|seinfeld|taskmaster|would i lie to you|have i got news|8 out of 10 cats|mock the week|live at the apollo|mrs brown|gavin & stacey|only fools|dad's army|fawlty towers|not going out|comedy)\b/i.test(title))
    ) {
      return "Comedy";
    }
    if (
      ev.eg === 3 &&
      (ev.esg === 10 || ev.esg === 11 || ev.esg === 17 || ev.esg === 19)
    ) {
      // Talk shows, cooking, travel, daytime & magazine shows (e.g. Sunday Brunch, Alan Titchmarsh)
      return channelCategory === "Documentary" ? "Documentary" : "Entertainment";
    }
    if (
      channelCategory === "Documentary" ||
      ev.eg === 9 ||
      ev.eg === 5 ||
      /\b(documentary|planet earth|attenborough|countryfile|panorama|dispatches|horizon|family farm|ice road|gold rush|cruising with)\b/i.test(title)
    ) {
      return "Documentary";
    }
    if (
      (ev.eg === 3 && ev.esg === 4) ||
      ev.eg === 10 ||
      channelCategory === "Drama" ||
      /\b(coronation street|eastenders|emmerdale|hollyoaks|casualty|holby|silent witness|vera|midsomer|death in paradise|call the midwife|grantchester|shetland|line of duty|happy valley|doctor who)\b/i.test(title)
    ) {
      return "Drama";
    }
    return EG_TO_GENRE[ev.eg] || channelCategory || "Entertainment";
  }

  // Cross-platform channel numbers mapped by lowercase channel name keywords
  const PLATFORM_NUMBERS_BY_NAME = [
    { match: /^bbc one/i, freeview: 1, virgin: 101, bt: 1, freesat: 101, color: "#b91c1c", catchup: "BBC iPlayer" },
    { match: /^bbc two/i, freeview: 2, virgin: 102, bt: 2, freesat: 102, color: "#0f766e", catchup: "BBC iPlayer" },
    { match: /^itv1/i, freeview: 3, virgin: 103, bt: 3, freesat: 103, color: "#0369a1", catchup: "ITVX" },
    { match: /^channel 4/i, freeview: 4, virgin: 104, bt: 4, freesat: 104, color: "#1d4ed8", catchup: "Channel 4" },
    { match: /^5\s*hd$|^channel 5/i, freeview: 5, virgin: 105, bt: 5, freesat: 105, color: "#4338ca", catchup: "My5" },
    { match: /^itv2/i, freeview: 6, virgin: 115, bt: 6, freesat: 113, color: "#0284c7", catchup: "ITVX" },
    { match: /^bbc alba/i, freeview: 7, virgin: 120, bt: 7, freesat: 109, color: "#0f766e", catchup: "BBC iPlayer" },
    { match: /^bbc four/i, freeview: 9, virgin: 107, bt: 9, freesat: 107, color: "#334155", catchup: "BBC iPlayer" },
    { match: /^itv3/i, freeview: 10, virgin: 117, bt: 10, freesat: 115, color: "#1e40af", catchup: "ITVX" },
    { match: /^sky mix/i, freeview: 11, virgin: null, bt: 11, freesat: null, color: "#2563eb", catchup: "NOW" },
    { match: /^quest\b(?!.*red)/i, freeview: 12, virgin: 137, bt: 12, freesat: 167, color: "#0e7490", catchup: "discovery+" },
    { match: /^e4\b(?!.*extra)/i, freeview: 13, virgin: 106, bt: 13, freesat: 122, color: "#7e22ce", catchup: "Channel 4" },
    { match: /^film4\b(?!.*\+1)/i, freeview: 14, virgin: 428, bt: 14, freesat: 300, color: "#991b1b", catchup: "Channel 4" },
    { match: /^really/i, freeview: 17, virgin: 128, bt: 17, freesat: 160, color: "#0d9488", catchup: "discovery+" },
    { match: /^more4/i, freeview: 18, virgin: 147, bt: 18, freesat: 124, color: "#0d9488", catchup: "Channel 4" },
    { match: /^u&dave/i, freeview: 19, virgin: 127, bt: 19, freesat: 157, color: "#3f3f46", catchup: "U" },
    { match: /^u&drama/i, freeview: 20, virgin: 130, bt: 20, freesat: 158, color: "#9f1239", catchup: "U" },
    { match: /^5usa/i, freeview: 21, virgin: 153, bt: 21, freesat: 129, color: "#1d4ed8", catchup: "My5" },
    { match: /^bbc three/i, freeview: 23, virgin: 108, bt: 23, freesat: 108, color: "#db2777", catchup: "BBC iPlayer" },
    { match: /^u&w/i, freeview: 25, virgin: 125, bt: 25, freesat: 156, color: "#0d9488", catchup: "U" },
    { match: /^itv4/i, freeview: 26, virgin: 118, bt: 26, freesat: 117, color: "#0f766e", catchup: "ITVX" },
    { match: /^u&yesterday/i, freeview: 27, virgin: 129, bt: 27, freesat: 159, color: "#854d0e", catchup: "U" },
    { match: /^itv quiz|^itvbe/i, freeview: 28, virgin: 119, bt: 28, freesat: 118, color: "#be185d", catchup: "ITVX" },
    { match: /^e4 extra/i, freeview: 31, virgin: 146, bt: 31, freesat: 181, color: "#6d28d9", catchup: "Channel 4" },
    { match: /^5star/i, freeview: 32, virgin: 151, bt: 32, freesat: 131, color: "#4f46e5", catchup: "My5" },
    { match: /^5action/i, freeview: 33, virgin: 150, bt: 33, freesat: 132, color: "#b91c1c", catchup: "My5" },
    { match: /^sky arts/i, freeview: 36, virgin: 123, bt: 36, freesat: 147, color: "#6d28d9", catchup: "NOW" },
    { match: /^dmax/i, freeview: 37, virgin: 173, bt: 37, freesat: 165, color: "#1d4ed8", catchup: "discovery+" },
    { match: /^5drama/i, freeview: 38, virgin: 152, bt: 38, freesat: 130, color: "#4f46e5", catchup: "My5" },
    { match: /^quest red/i, freeview: 39, virgin: 170, bt: 39, freesat: 168, color: "#be123c", catchup: "discovery+" },
    { match: /^legend\b(?!.*xtra)/i, freeview: 41, virgin: 149, bt: 41, freesat: 137, color: "#7c2d12", catchup: "Watch Free UK" },
    { match: /^great! action/i, freeview: 42, virgin: 426, bt: 42, freesat: 304, color: "#b91c1c", catchup: "GREAT! player" },
    { match: /^food network/i, freeview: 43, virgin: 282, bt: 43, freesat: 148, color: "#dc2626", catchup: "discovery+" },
    { match: /^4seven/i, freeview: 49, virgin: 148, bt: 49, freesat: 127, color: "#2563eb", catchup: "Channel 4" },
    { match: /^great! tv/i, freeview: 50, virgin: 180, bt: 50, freesat: 142, color: "#9333ea", catchup: "GREAT! player" },
    { match: /^u&eden/i, freeview: 57, virgin: 245, bt: 57, freesat: 164, color: "#166534", catchup: "U" },
    { match: /^blaze/i, freeview: 64, virgin: 174, bt: 64, freesat: 162, color: "#ea580c", catchup: "BLAZE" },
    { match: /^true crime\b(?!.*xtra)/i, freeview: 67, virgin: 148, bt: 67, freesat: 143, color: "#991b1b", catchup: "Watch Free UK" },
    { match: /^talking pictures/i, freeview: 82, virgin: 445, bt: 82, freesat: 306, color: "#475569", catchup: "TPTV Encore" },
    { match: /^together tv/i, freeview: 83, virgin: 136, bt: 83, freesat: 164, color: "#0d9488", catchup: "Freeview Play" },
    { match: /^pbs america/i, freeview: 84, virgin: 187, bt: 84, freesat: 155, color: "#1e3a8a", catchup: "Freeview Play" },
    { match: /^sky one/i, freeview: null, virgin: 109, bt: 339, freesat: null, color: "#0f172a", catchup: "NOW" },
    { match: /^sky witness/i, freeview: null, virgin: 110, bt: 341, freesat: null, color: "#4338ca", catchup: "NOW" },
    { match: /^sky atlantic/i, freeview: null, virgin: null, bt: 342, freesat: null, color: "#111827", catchup: "NOW" },
    { match: /^u&alibi/i, freeview: null, virgin: 126, bt: 312, freesat: null, color: "#881337", catchup: "NOW" },
    { match: /^u&gold/i, freeview: null, virgin: 124, bt: 310, freesat: null, color: "#ca8a04", catchup: "NOW" },
    { match: /^comedycent|^comedy central/i, freeview: null, virgin: 132, bt: 306, freesat: null, color: "#ea580c", catchup: "NOW" },
    { match: /^sky comedy/i, freeview: null, virgin: 112, bt: 343, freesat: null, color: "#d97706", catchup: "NOW" },
    { match: /^sky doc/i, freeview: null, virgin: 188, bt: 346, freesat: null, color: "#0f766e", catchup: "NOW" },
    { match: /^sky crime/i, freeview: null, virgin: 122, bt: 344, freesat: null, color: "#7f1d1d", catchup: "NOW" },
    { match: /^sky history/i, freeview: null, virgin: 270, bt: 324, freesat: null, color: "#78350f", catchup: "NOW" },
    { match: /^sky nature/i, freeview: null, virgin: 189, bt: 347, freesat: null, color: "#15803d", catchup: "NOW" },
    { match: /^discovery\b(?!.*history|.*sci|.*turbo)/i, freeview: null, virgin: 250, bt: 322, freesat: null, color: "#0369a1", catchup: "discovery+" },
    { match: /^nat geo|^national geo/i, freeview: null, virgin: 266, bt: 317, freesat: null, color: "#ca8a04", catchup: "Disney+" },
    { match: /^tlc/i, freeview: null, virgin: 167, bt: 320, freesat: null, color: "#db2777", catchup: "discovery+" },
    { match: /^mtv/i, freeview: null, virgin: 134, bt: 308, freesat: null, color: "#18181b", catchup: "Paramount+" },
    { match: /^sky sci-fi/i, freeview: null, virgin: 139, bt: 345, freesat: null, color: "#1e293b", catchup: "NOW" },
    { match: /^sky cinema|^sky.*prem|^sky.*hits|^sky.*action|^sky.*greats|^sky.*family|^sky.*comedy|^sky.*thriller|^sky.*drama|^sky.*sci-fi/i, freeview: null, virgin: 401, bt: 500, freesat: null, color: "#6b21a8", catchup: "NOW" },
    { match: /^sky sports/i, freeview: null, virgin: 501, bt: 420, freesat: null, color: "#1e3a8a", catchup: "NOW" },
    { match: /^tnt sports/i, freeview: null, virgin: 527, bt: 408, freesat: null, color: "#15803d", catchup: "discovery+" },
    { match: /^bbc news/i, freeview: 231, virgin: 601, bt: 231, freesat: 200, color: "#dc2626", catchup: "BBC iPlayer" },
    { match: /^sky news/i, freeview: 233, virgin: 603, bt: 233, freesat: 202, color: "#b91c1c", catchup: "YouTube" },
    { match: /^gb news/i, freeview: 236, virgin: 604, bt: 236, freesat: 216, color: "#1d4ed8", catchup: "YouTube" },
    { match: /^cbbc/i, freeview: 201, virgin: 701, bt: 201, freesat: 205, color: "#16a34a", catchup: "BBC iPlayer" },
    { match: /^cbeebies/i, freeview: 202, virgin: 702, bt: 202, freesat: 206, color: "#eab308", catchup: "BBC iPlayer" },
    { match: /^cartoon network/i, freeview: null, virgin: 704, bt: 450, freesat: null, color: "#18181b", catchup: "NOW" },
    { match: /^nickelodeon/i, freeview: null, virgin: 712, bt: 451, freesat: null, color: "#ea580c", catchup: "Paramount+" }
  ];

  const WEB_CHANNEL_MAP = {
    "netflix": { name: "Netflix", color: "#e50914" },
    "bbc iplayer": { name: "BBC iPlayer", color: "#ff4c98" },
    "itvx": { name: "ITVX", color: "#2563eb" },
    "itv hub": { name: "ITVX", color: "#2563eb" },
    "channel 4": { name: "Channel 4", color: "#1d4ed8" },
    "all 4": { name: "Channel 4", color: "#1d4ed8" },
    "prime video": { name: "Prime Video", color: "#00a8e1" },
    "amazon prime video": { name: "Prime Video", color: "#00a8e1" },
    "disney+": { name: "Disney+", color: "#0063e5" },
    "apple tv+": { name: "Apple TV+", color: "#1d1d1f" },
    "apple tv": { name: "Apple TV+", color: "#1d1d1f" },
    "now": { name: "Sky / NOW", color: "#0f766e" },
    "sky go": { name: "Sky / NOW", color: "#0f766e" },
    "paramount+": { name: "Paramount+", color: "#0064ff" },
    "mubi": { name: "MUBI", color: "#1e293b" },
    "bfi player": { name: "BFI Player", color: "#be123c" }
  };

  function stripHtml(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  function getSkyDateString(dayOffset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  function getIsoDateString(dayOffset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function loadCache() {
    try {
      // Remove superseded EPG cache versions so they don't waste localStorage quota
      ["onair_live_epg_v3", "onair_live_epg_v4", "onair_live_epg_v5"].forEach((oldKey) => {
        if (localStorage.getItem(oldKey) !== null) localStorage.removeItem(oldKey);
      });
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveCache(cache) {
    // Auto-prune past EPG schedule days older than 7 days ago so catch-up + upcoming stays compact
    const minSkyDate = getSkyDateString(-7);
    const minIsoDate = getIsoDateString(-7);
    Object.keys(cache).forEach((k) => {
      if ((k.startsWith("epg_") || k.startsWith("fv_")) && k.split("_")[1] < minSkyDate) {
        delete cache[k];
      } else if (k.startsWith("tvmaze_gb_") && k.slice(10) < minIsoDate) {
        delete cache[k];
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // If browser quota is tight, drop oldest/furthest EPG day and retry once
      const epgKeys = Object.keys(cache).filter((k) => k.startsWith("epg_")).sort();
      if (epgKeys.length > 1) {
        delete cache[epgKeys[epgKeys.length - 1]];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        } catch {
          // Ignore if still full
        }
      }
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function inferCategoryFromChannel(skyNum, sg, name) {
    const n = Number(skyNum);
    if (n >= 301 && n <= 349) return "Film";
    if (n >= 350 && n <= 399) return "Music";
    if (n >= 400 && n <= 499) return "Sport";
    if (n >= 500 && n <= 549) return "News";
    if (n >= 600 && n <= 649) return "Kids";
    if (n >= 1000 || skyNum.startsWith("01")) return "Radio";
    if (/doc|history|nature|discovery|nat geo|animal|crime|science|pbs|eden|yesterday|really/i.test(name)) return "Documentary";
    if (/drama|atlantic|witness|alibi/i.test(name)) return "Drama";
    return SG_TO_CATEGORY[sg] || "Entertainment";
  }

  function makeShortCode(name) {
    const cleaned = name.replace(/\b(HD|UHD|SD|\+1)\b/gi, "").trim();
    const words = cleaned.split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 5).toUpperCase();
    return words.map((w) => w[0]).join("").slice(0, 5).toUpperCase();
  }

  function inferInterestsFromEvent(title, sy, genre) {
    const text = `${title} ${sy}`.toLowerCase();
    const list = [];
    if (genre === "Drama") list.push("Prestige Drama");
    if (genre === "Comedy") list.push("Comedy & Sitcoms");
    if (genre === "Sport") list.push("Live Sport");
    if (genre === "Documentary") list.push("True Crime & Documentaries");
    if (genre === "Film") list.push("Blockbuster Films");
    if (/crime|murder|detective|police|thriller|killer|mystery/i.test(text)) list.push("Crime & Thrillers");
    if (/sci-fi|space|alien|future|star trek|doctor who|fantasy|dragon/i.test(text)) list.push("Sci-Fi & Fantasy");
    if (/history|art|bbc four|world|culture|symphony|opera|museum/i.test(text)) list.push("Arts, History & Culture");
    if (/french|italian|spanish|korean|japanese|subtitled|foreign/i.test(text)) list.push("World Cinema & International TV");
    return [...new Set(list)];
  }

  // 1. Fetch Live Full UK Channel Lineup from Sky EPG API (with multi-tier backup)
  async function fetchLiveChannels(force = false) {
    const cache = loadCache();
    if (!force && cache.channels && Date.now() - cache.channels.ts < CHANNELS_TTL_MS) {
      return cache.channels.list;
    }

    try {
      const data = await fetchJson("https://awk.epgsky.com/hawk/linear/services/4101/1");
      const services = (data.services || []).filter((s) => !s.adult && Number(s.c) < 800);

      const channels = services.map((s) => {
        const skyNum = Number(s.c);
        const name = s.t;
        const category = inferCategoryFromChannel(s.c, s.sg, name);
        const isTimeshift = /\+1\b/i.test(name);
        const meta = isTimeshift ? null : PLATFORM_NUMBERS_BY_NAME.find((m) => m.match.test(name));

        const defaultColors = {
          Entertainment: "#1d4ed8",
          Drama: "#881337",
          Film: "#6b21a8",
          Sport: "#15803d",
          Documentary: "#0f766e",
          News: "#dc2626",
          Kids: "#ea580c",
          Music: "#db2777",
          Radio: "#334155"
        };

        return {
          id: `sky-${s.sid}`,
          sid: s.sid,
          name,
          short: makeShortCode(name),
          color: meta ? meta.color : defaultColors[category] || "#334155",
          category,
          hd: s.sf === "HD" || s.sf === "UHD",
          catchup: meta ? meta.catchup : (s.avail && s.avail.includes("OTT") ? "On Demand" : "Live TV"),
          numbers: {
            sky: skyNum,
            freeview: meta ? meta.freeview : null,
            virgin: meta ? meta.virgin : null,
            bt: meta ? meta.bt : null,
            freesat: meta ? meta.freesat : null
          }
        };
      });

      if (channels.length > 0) {
        cache.channels = { ts: Date.now(), list: channels };
        saveCache(cache);
        return channels;
      }
    } catch {
      // Fall through to backups
    }

    // Backup #1: stale localStorage channels
    if (cache.channels && Array.isArray(cache.channels.list) && cache.channels.list.length > 0) {
      return cache.channels.list;
    }
    // Backup #2: static CHANNELS from data.js
    if (typeof ONAIR_DATA !== "undefined" && Array.isArray(ONAIR_DATA.CHANNELS)) {
      return ONAIR_DATA.CHANNELS;
    }
    return [];
  }

  // 2. Fetch Live Linear Schedules for a list of SIDs on a given dayOffset
  const inFlightSids = new Set();

  async function fetchSkySchedulesForSids(sids, dayOffset = 0, force = false) {
    if (!sids || sids.length === 0) return {};
    const dateStr = getSkyDateString(dayOffset);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    const dayStartSec = Math.floor(dayStart.getTime() / 1000);

    const cache = loadCache();
    const dayCache = cache[`epg_${dateStr}`] || {};
    const result = {};
    const toFetch = [];

    sids.forEach((sid) => {
      if (!force && dayCache[sid] && Date.now() - dayCache[sid].ts < CACHE_TTL_MS) {
        result[sid] = dayCache[sid].events;
      } else if (!inFlightSids.has(`${dateStr}-${sid}`)) {
        toFetch.push(sid);
      }
    });

    if (toFetch.length === 0) return result;

    // Batch in groups of 20 SIDs
    const chunks = [];
    for (let i = 0; i < toFetch.length; i += 20) {
      chunks.push(toFetch.slice(i, i + 20));
    }

    toFetch.forEach((sid) => inFlightSids.add(`${dateStr}-${sid}`));

    try {
      const isoDate = getIsoDateString(dayOffset);
      const [tvmazeMap, responses] = await Promise.all([
        fetchTvmazeUkMap(isoDate, cache),
        Promise.all(
          chunks.map((chunk) =>
            fetchJson(`https://awk.epgsky.com/hawk/linear/schedule/${dateStr}/${chunk.join(",")}`).catch(() => ({ schedule: [] }))
          )
        )
      ]);

      const chCatBySid = new Map();
      const chNameBySid = new Map();
      if (cache.channels && Array.isArray(cache.channels.list)) {
        cache.channels.list.forEach((c) => {
          chCatBySid.set(String(c.sid), c.category);
          chNameBySid.set(String(c.sid), c.name);
        });
      }

      const vault = loadVault();
      let vaultDirty = false;
      const gotSids = new Set();

      responses.forEach((resp) => {
        (resp.schedule || []).forEach((chSched) => {
          const sid = chSched.sid;
          const chCat = chCatBySid.get(String(sid)) || null;
          const mappedEvents = (chSched.events || [])
            .map((ev) => {
              const startMin = Math.floor((ev.st - dayStartSec) / 60);
              const endMin = Math.floor((ev.st + ev.d - dayStartSec) / 60);
              if (endMin <= 360 || startMin >= 24 * 60) return null;

              const clampedStart = Math.max(360, startMin);
              const clampedEnd = Math.min(24 * 60, endMin);
              if (clampedEnd <= clampedStart) return null;

              const rawTitle = ev.t || "Untitled";
              const titleKey = normalizeTitleKey(rawTitle.replace(/^Live:\s*/i, "").replace(/^New:\s*/i, ""));
              const storedEntry = titleKey ? vault[titleKey] : null;
              let genre = storedEntry && storedEntry.category ? storedEntry.category : null;
              if (!genre) {
                genre = classifyProgrammeGenre(ev, chCat, tvmazeMap);
                if (titleKey) {
                  vault[titleKey] = {
                    ...(storedEntry || {}),
                    category: genre,
                    savedAt: Date.now()
                  };
                  vaultDirty = true;
                }
              }

              const epLabel =
                ev.seasonnumber && ev.episodenumber
                  ? `Series ${ev.seasonnumber}, Ep ${ev.episodenumber}`
                  : ev.episodenumber
                  ? `Episode ${ev.episodenumber}`
                  : genre;

              return {
                id: `skyev-${ev.eid || `${sid}-${ev.st}`}`,
                channelId: `sky-${sid}`,
                sid,
                dayOffset,
                title: rawTitle,
                genre,
                rating: ev.r && ev.r !== "--" ? ev.r : "PG",
                ep: epLabel,
                desc: ev.sy || "Live UK television broadcast.",
                cast: genre,
                stars: null,
                isNew: Boolean(ev.new),
                isLiveData: true,
                thisWeek: Boolean(ev.new),
                interests: inferInterestsFromEvent(rawTitle, ev.sy || "", genre),
                startMin: clampedStart,
                endMin: clampedEnd
              };
            })
            .filter(Boolean);

          if (mappedEvents.length > 0) {
            gotSids.add(String(sid));
            result[sid] = mappedEvents;
            dayCache[sid] = { ts: Date.now(), events: mappedEvents };
          }
        });
      });

      if (vaultDirty) saveVault(vault);

      // Backup #1 (Freeview UK 165-channel full schedule), Backup #2 (TVMaze UK), Backup #3 (stale cache)
      const missingFromSky = toFetch.filter((sid) => !gotSids.has(String(sid)));
      if (missingFromSky.length > 0) {
        // Freeview helper: parse ISO8601 duration "PT1H30M" -> minutes
        const parseIsoDurMins = (durStr) => {
          const h = durStr && durStr.match(/(\d+)H/);
          const m = durStr && durStr.match(/(\d+)M/);
          return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0) || 30;
        };
        const mapFreeviewGenre = (fvGenre, title, chCat) => {
          const gCode = fvGenre ? fvGenre.split(":").pop() : "";
          const key = normalizeTitleKey(title);
          if (vault[key] && vault[key].category) return vault[key].category;
          if (tvmazeMap[key]) return tvmazeMap[key];
          if (gCode === "2") return "News";
          if (gCode === "4") return "Sport";
          if (gCode === "5") return "Kids";
          if (gCode === "6") return "Music";
          if (gCode === "9" || gCode === "7" || gCode === "8") return "Documentary";
          if (gCode === "1") return chCat === "Film" ? "Film" : "Drama";
          return chCat || "Entertainment";
        };
        const normChName = (n) =>
          String(n || "")
            .toLowerCase()
            .replace(/\b(hd|uhd|sd|lon|london|uk)\b/g, "")
            .replace(/[^a-z0-9+]/g, "")
            .trim();

        let fvByChannel = cache[`fv_${dateStr}`] && cache[`fv_${dateStr}`].byCh ? cache[`fv_${dateStr}`].byCh : null;
        if (!fvByChannel) {
          const fvUrl = `https://www.freeview.co.uk/api/tv-guide?nid=64257&start=${dayStartSec}`;
          let fvData = null;
          for (const proxyUrl of [
            `https://corsproxy.io/?${encodeURIComponent(fvUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(fvUrl)}`
          ]) {
            try {
              const r = await fetchJson(proxyUrl);
              if (r && r.data && Array.isArray(r.data.programs)) {
                fvData = r.data.programs;
                break;
              }
            } catch {
              // try next proxy
            }
          }
          if (fvData) {
            fvByChannel = {};
            fvData.forEach((chObj) => {
              const nk = normChName(chObj.title);
              if (!nk || !Array.isArray(chObj.events)) return;
              fvByChannel[nk] = chObj.events;
            });
            cache[`fv_${dateStr}`] = { ts: Date.now(), byCh: fvByChannel };
          }
        }

        let tvmazeUkList = null;
        for (const sid of missingFromSky) {
          const rawName = chNameBySid.get(String(sid)) || "";
          const nk = normChName(rawName);
          const fvEvents = fvByChannel && (fvByChannel[nk] || fvByChannel[nk.replace(/1$/, "")]);

          if (fvEvents && fvEvents.length > 0) {
            const mappedFv = fvEvents
              .map((ev) => {
                const stSec = Math.floor(new Date(ev.start_time).getTime() / 1000);
                const durMin = parseIsoDurMins(ev.duration);
                const startMin = Math.floor((stSec - dayStartSec) / 60);
                const endMin = startMin + durMin;
                if (endMin <= 360 || startMin >= 24 * 60) return null;
                const clampedStart = Math.max(360, startMin);
                const clampedEnd = Math.min(24 * 60, endMin);
                if (clampedEnd <= clampedStart) return null;
                const genre = mapFreeviewGenre(ev.genre, ev.main_title, chCatBySid.get(String(sid)));
                return {
                  id: `fv-${ev.uuid || `${sid}-${stSec}`}`,
                  channelId: `sky-${sid}`,
                  sid,
                  dayOffset,
                  title: ev.main_title || "Untitled",
                  genre,
                  rating: "PG",
                  ep: ev.secondary_title || genre,
                  desc: ev.secondary_title ? `${ev.main_title}: ${ev.secondary_title}` : `${ev.main_title} (${rawName})`,
                  cast: genre,
                  stars: null,
                  isNew: false,
                  isLiveData: true,
                  thisWeek: false,
                  interests: inferInterestsFromEvent(ev.main_title || "", ev.secondary_title || "", genre),
                  startMin: clampedStart,
                  endMin: clampedEnd
                };
              })
              .filter(Boolean);

            if (mappedFv.length > 0) {
              result[sid] = mappedFv;
              dayCache[sid] = { ts: Date.now(), events: mappedFv };
              continue;
            }
          }

          // Backup #2: TVMaze UK linear broadcast
          if (tvmazeUkList === null) {
            try {
              tvmazeUkList = await fetchJson(`https://api.tvmaze.com/schedule?country=GB&date=${isoDate}`);
            } catch {
              tvmazeUkList = [];
            }
          }
          const chName = rawName.toLowerCase();
          const chEvents = (Array.isArray(tvmazeUkList) ? tvmazeUkList : [])
            .filter((ep) => {
              const net = ep.show && ep.show.network && ep.show.network.name ? ep.show.network.name.toLowerCase() : "";
              return net && (chName.includes(net) || net.includes(chName.replace(/\b(hd|uhd|sd|lon)\b/g, "").trim()));
            })
            .map((ep) => {
              const parts = (ep.airtime || "12:00").split(":");
              const startMin = Math.max(360, Number(parts[0]) * 60 + Number(parts[1] || 0));
              const endMin = Math.min(24 * 60, startMin + (ep.runtime || 60));
              if (endMin <= startMin) return null;
              const show = ep.show || {};
              const genre = mapTvmazeShowToCategory(show) || chCatBySid.get(String(sid)) || "Entertainment";
              return {
                id: `tvm-${ep.id}`,
                channelId: `sky-${sid}`,
                sid,
                dayOffset,
                title: show.name || ep.name || "Untitled",
                genre,
                rating: "PG",
                ep: ep.season && ep.number ? `Series ${ep.season}, Ep ${ep.number}` : genre,
                desc: stripHtml(ep.summary || show.summary) || "Live UK television broadcast.",
                cast: genre,
                stars: null,
                isNew: true,
                isLiveData: true,
                thisWeek: true,
                interests: inferInterestsFromEvent(show.name || "", show.summary || "", genre),
                startMin,
                endMin
              };
            })
            .filter(Boolean);

          if (chEvents.length > 0) {
            result[sid] = chEvents;
            dayCache[sid] = { ts: Date.now(), events: chEvents };
          } else if (dayCache[sid] && Array.isArray(dayCache[sid].events)) {
            // Backup #3: stale cached schedule from localStorage
            result[sid] = dayCache[sid].events;
          }
        }
      }

      cache[`epg_${dateStr}`] = dayCache;
      saveCache(cache);
    } finally {
      toFetch.forEach((sid) => inFlightSids.delete(`${dateStr}-${sid}`));
    }

    return result;
  }

  // 3. Fetch & Persist UK & Global Streaming Drops (seeded from repo vault_data.js + localStorage)
  async function fetchLiveStreaming(force = false) {
    const repoVault = typeof window !== "undefined" && window.ONAIR_VAULT_DATA ? window.ONAIR_VAULT_DATA : null;
    const repoStreaming = repoVault && Array.isArray(repoVault.streaming) ? repoVault.streaming : [];
    const repoTs = repoVault && repoVault.updatedAt ? new Date(repoVault.updatedAt).getTime() : 0;

    const cache = loadCache();
    const cached = cache.streaming_vault_v1;
    if (!force && cached && Array.isArray(cached.items) && cached.items.length > 0 && Date.now() - cached.ts < STREAMING_TTL_MS) {
      return cached.items;
    }
    if (!force && repoStreaming.length > 0 && repoTs && Date.now() - repoTs < STREAMING_TTL_MS * 2) {
      return repoStreaming;
    }

    const dayOffsets = [0, -1, -2, -3, -4, -5, -6, -7, -10, -14, -18, -21, -25, -28];
    const seen = new Set();
    const items = [];
    const vault = loadVault();
    let vaultDirty = false;

    // Fetch in parallel batches of 5 days
    for (let i = 0; i < dayOffsets.length; i += 5) {
      const batch = dayOffsets.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (offset) => {
          const dStr = getIsoDateString(offset);
          const [ukWeb, globalWeb] = await Promise.all([
            fetchJson(`https://api.tvmaze.com/schedule/web?country=GB&date=${dStr}`).catch(() => []),
            fetchJson(`https://api.tvmaze.com/schedule/web?date=${dStr}`).catch(() => [])
          ]);
          return { offset, dStr, list: [...ukWeb, ...globalWeb] };
        })
      );

      batchResults.forEach(({ offset, dStr, list }) => {
        const isThisWeek = Math.abs(offset) <= 7;
        list.forEach((ep) => {
          const show = (ep._embedded && ep._embedded.show) || ep.show;
          if (!show || !show.webChannel) return;

          const wcName = show.webChannel.name.toLowerCase().trim();
          const mapped = WEB_CHANNEL_MAP[wcName];
          if (!mapped) return;

          const key = `${mapped.name}-${show.id}`;
          if (seen.has(key)) return;
          seen.add(key);

          const genreRaw = (show.genres && show.genres[0]) || "Drama";
          let genre = "Drama";
          if (/comedy/i.test(genreRaw)) genre = "Comedy";
          else if (/thriller|crime|mystery/i.test(genreRaw)) genre = "Thriller";
          else if (/sci-fi|science|fantasy/i.test(genreRaw)) genre = "Sci-Fi";
          else if (/doc/i.test(genreRaw)) genre = "Documentary";
          else if (/sport/i.test(genreRaw)) genre = "Sport";

          const imdbId = show.externals && show.externals.imdb ? show.externals.imdb : null;
          const score10 = show.rating && show.rating.average ? show.rating.average : null;
          const directUrl = normalizeDirectUrl(show.officialSite || show.url || null);
          const vaultKey = normalizeTitleKey(show.name);
          const existingVault = vault[vaultKey];

          // Store reusable show metadata/links + hard-wired category in persistent vault immediately
          if (vaultKey && (!existingVault || (!existingVault.imdbId && imdbId) || (!existingVault.score10 && score10) || !existingVault.category)) {
            vault[vaultKey] = {
              ...(existingVault || {}),
              category: (existingVault && existingVault.category) || genre,
              directUrl: directUrl || (existingVault && existingVault.directUrl) || null,
              tvmazeUrl: show.url || (existingVault && existingVault.tvmazeUrl) || null,
              imdbId: imdbId || (existingVault && existingVault.imdbId) || null,
              rtSlug: (existingVault && existingVault.rtSlug) || null,
              score10: score10 || (existingVault && existingVault.score10) || null,
              image: (show.image && show.image.medium) || (existingVault && existingVault.image) || null,
              rating: score10 ? Math.min(5, Math.max(3, Math.round(score10 / 2))) : (existingVault && existingVault.rating) || null,
              savedAt: Date.now()
            };
            vaultDirty = true;
          }

          items.push({
            id: `live-st-${show.id}`,
            title: show.name,
            platform: mapped.name,
            platformColor: mapped.color,
            type: /doc/i.test(show.type || "") ? "Documentaries" : "TV Series",
            genre,
            year: show.premiered ? Number(show.premiered.slice(0, 4)) : 2026,
            seasons: ep.season ? `Season ${ep.season} (${dStr})` : `Released ${dStr}`,
            rating: score10 ? Math.min(5, Math.max(3, Math.round(score10 / 2))) : 4,
            imdbId,
            imdbScore: score10 ? Number(score10).toFixed(1) : null,
            rtSlug: existingVault ? existingVault.rtSlug : null,
            age: "15",
            isLiveData: true,
            thisWeek: isThisWeek,
            releaseWindow: isThisWeek ? "This Week" : "Last 30 Days",
            interests: inferInterestsFromEvent(show.name, show.summary || "", genre),
            image: show.image ? show.image.medium : null,
            officialSite: directUrl,
            cast: (show.genres && show.genres.join(", ")) || show.type || "Streaming",
            desc: stripHtml(ep.summary || show.summary) || `New episode "${ep.name || ""}" streaming on ${mapped.name}.`
          });
        });
      });
    }

    if (vaultDirty) saveVault(vault);

    // Merge with previously stored streaming items so catalogue persists across sessions
    const prevItems = cached && Array.isArray(cached.items) ? cached.items : [];
    const mergedMap = new Map();
    items.forEach((it) => mergedMap.set(it.id, it));
    prevItems.forEach((it) => {
      if (!mergedMap.has(it.id)) mergedMap.set(it.id, it);
    });
    const merged = Array.from(mergedMap.values()).slice(0, 350);

    if (merged.length > 0) {
      cache.streaming_vault_v1 = { ts: Date.now(), items: merged };
      saveCache(cache);
      return merged;
    }

    // Backup #1: stale localStorage streaming vault
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      return cached.items;
    }
    // Backup #2: folder vault_data.js
    return repoStreaming;
  }

  // 4. Fetch Multi-Source UK TV, Streaming & Film RSS Feeds
  const RSS_SOURCES = [
    { id: "netflix-uk", name: "What's on Netflix UK", color: "#e50914", url: "https://www.whats-on-netflix.com/whats-new/uk/feed/" },
    { id: "guardian-tv", name: "Guardian TV & Radio", color: "#0f4c5c", url: "https://www.theguardian.com/uk/tv-and-radio/rss" },
    { id: "digital-spy", name: "Digital Spy", color: "#7e22ce", url: "https://www.digitalspy.com/rss/all.xml/" },
    { id: "bbc-arts", name: "BBC Entertainment", color: "#b91c1c", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml" },
    { id: "guardian-film", name: "Guardian Film", color: "#1d4ed8", url: "https://www.theguardian.com/film/rss" }
  ];

  function parseRssXml(xmlText, src) {
    try {
      const doc = new DOMParser().parseFromString(xmlText, "text/xml");
      const nodes = Array.from(doc.querySelectorAll("item, entry")).slice(0, 8);
      return nodes.map((node) => {
        const title = (node.querySelector("title")?.textContent || "").trim();
        const linkEl = node.querySelector("link");
        const link = (linkEl?.getAttribute("href") || linkEl?.textContent || "").trim();
        const pubDate = (node.querySelector("pubDate, updated, published")?.textContent || "").trim();
        const desc = (node.querySelector("description, summary, content")?.textContent || "").trim();
        const author = (node.querySelector("author name, dc\\:creator, creator")?.textContent || src.name).trim();
        return {
          sourceId: src.id,
          sourceName: src.name,
          sourceColor: src.color,
          title,
          pubDate,
          ts: pubDate ? new Date(pubDate).getTime() || 0 : 0,
          link,
          author,
          description: stripHtml(desc).slice(0, 190) + "...",
          thumbnail: null
        };
      }).filter((it) => it.title && it.link);
    } catch {
      return [];
    }
  }

  async function fetchSingleRssWithBackups(src) {
    // Primary: rss2json
    try {
      const apiUrl = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(src.url);
      const res = await fetchJson(apiUrl);
      if (res && res.status === "ok" && Array.isArray(res.items) && res.items.length > 0) {
        return res.items.slice(0, 8).map((item) => ({
          sourceId: src.id,
          sourceName: src.name,
          sourceColor: src.color,
          title: item.title,
          pubDate: item.pubDate,
          ts: item.pubDate ? new Date(item.pubDate.replace(" ", "T")).getTime() || 0 : 0,
          link: item.link,
          author: item.author || src.name,
          description: stripHtml(item.description || item.content).slice(0, 190) + "...",
          thumbnail: item.thumbnail || null
        }));
      }
    } catch {
      // Fall through to backup #1
    }

    // Backup #1: allorigins raw XML + DOMParser
    try {
      const res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(src.url));
      if (res.ok) {
        const parsed = parseRssXml(await res.text(), src);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // Fall through to backup #2
    }

    // Backup #2: corsproxy.io raw XML + DOMParser
    try {
      const res = await fetch("https://corsproxy.io/?" + encodeURIComponent(src.url));
      if (res.ok) {
        const parsed = parseRssXml(await res.text(), src);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // All live proxies failed
    }
    return [];
  }

  async function fetchRssFeeds(force = false) {
    const cache = loadCache();
    const cached = cache.rss_feeds_v2;
    if (!force && cached && Date.now() - cached.ts < RSS_TTL_MS && cached.items.length > 0) {
      return cached.items;
    }

    const allItems = [];
    for (const src of RSS_SOURCES) {
      const items = await fetchSingleRssWithBackups(src);
      allItems.push(...items);
      await new Promise((r) => setTimeout(r, 180));
    }

    allItems.sort((a, b) => b.ts - a.ts);

    if (allItems.length > 0) {
      cache.rss_feeds_v2 = { ts: Date.now(), items: allItems };
      saveCache(cache);
      return allItems;
    }
    // Backup #3: stale localStorage RSS cache
    return cached && Array.isArray(cached.items) ? cached.items : [];
  }

  // 5. Persistent Show Metadata & Link Vault (stored once, reused across sessions)
  const showLinkCache = new Map();

  function normalizeTitleKey(rawTitle) {
    return String(rawTitle || "")
      .replace(/^Film:\s*/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s*:\s*Series\s*\d+.*$/i, "")
      .trim()
      .toLowerCase();
  }

  function normalizeDirectUrl(url) {
    if (!url) return null;
    if (/bbc\.co\.uk\/programmes\/([a-z0-9]+)/i.test(url)) {
      const pid = url.match(/bbc\.co\.uk\/programmes\/([a-z0-9]+)/i)[1];
      return `https://www.bbc.co.uk/iplayer/episodes/${pid}`;
    }
    return url;
  }

  function loadVault() {
    const repoShows =
      typeof window !== "undefined" && window.ONAIR_VAULT_DATA && window.ONAIR_VAULT_DATA.shows
        ? window.ONAIR_VAULT_DATA.shows
        : {};
    try {
      const localShows = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) || "{}");
      return { ...repoShows, ...localShows };
    } catch {
      return { ...repoShows };
    }
  }

  function saveVault(vault) {
    // Keep up to 5,000 most recently used/saved shows (~1.2–1.6 MB) within browser ~5 MB localStorage limit
    const entries = Object.entries(vault);
    let limit = 5000;
    if (entries.length > limit) {
      entries.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
    }
    while (limit >= 500) {
      try {
        const slice = entries.length > limit ? Object.fromEntries(entries.slice(0, limit)) : vault;
        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(slice));
        return;
      } catch {
        // Browser ~5 MB quota reached: trim oldest entries and retry
        entries.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
        limit = Math.floor(Math.min(entries.length, limit) * 0.8);
      }
    }
  }

  function getVaultStats() {
    const vault = loadVault();
    return { showsCached: Object.keys(vault).length };
  }

  function getStorageReport() {
    const repoVault = typeof window !== "undefined" && window.ONAIR_VAULT_DATA ? window.ONAIR_VAULT_DATA : null;
    const repoShowsCount = repoVault && repoVault.shows ? Object.keys(repoVault.shows).length : 0;
    const repoStreamingCount = repoVault && Array.isArray(repoVault.streaming) ? repoVault.streaming.length : 0;
    const repoUpdatedAt = repoVault && repoVault.updatedAt ? repoVault.updatedAt : null;

    let localShowsCount = 0;
    try {
      localShowsCount = Object.keys(JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) || "{}")).length;
    } catch {
      localShowsCount = 0;
    }

    const cache = loadCache();
    const epgDaysCached = Object.keys(cache).filter((k) => k.startsWith("epg_")).length;

    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("onair_")) {
          totalBytes += (k.length + (localStorage.getItem(k) || "").length) * 2;
        }
      }
    } catch {
      totalBytes = 0;
    }

    return {
      repoUpdatedAt,
      repoShowsCount,
      repoStreamingCount,
      mergedShowsCount: getVaultStats().showsCached,
      localShowsCount,
      epgDaysCached,
      totalStorageKb: (totalBytes / 1024).toFixed(1)
    };
  }

  function buildExportVaultJs() {
    const repoVault = typeof window !== "undefined" && window.ONAIR_VAULT_DATA ? window.ONAIR_VAULT_DATA : {};
    const mergedShows = loadVault();
    const cache = loadCache();
    const cachedStreaming = cache.streaming_vault_v1 && Array.isArray(cache.streaming_vault_v1.items)
      ? cache.streaming_vault_v1.items
      : [];
    const repoStreaming = Array.isArray(repoVault.streaming) ? repoVault.streaming : [];
    const streamingMap = new Map();
    cachedStreaming.forEach((it) => streamingMap.set(it.id, it));
    repoStreaming.forEach((it) => {
      if (!streamingMap.has(it.id)) streamingMap.set(it.id, it);
    });

    const payload = {
      updatedAt: new Date().toISOString(),
      shows: mergedShows,
      streaming: Array.from(streamingMap.values()).slice(0, 350)
    };
    return `window.ONAIR_VAULT_DATA = ${JSON.stringify(payload, null, 2)};\n`;
  }

  function clearEpgCache() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function clearShowVault() {
    showLinkCache.clear();
    try {
      localStorage.removeItem(VAULT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  async function resolveDirectShowLink(rawTitle) {
    const clean = String(rawTitle || "")
      .replace(/^Film:\s*/i, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s*:\s*Series\s*\d+.*$/i, "")
      .trim();
    if (!clean) return null;
    const key = clean.toLowerCase();

    if (showLinkCache.has(key)) {
      return showLinkCache.get(key);
    }

    // Check persistent localStorage Show Vault first (30-day reuse, zero API calls)
    const vault = loadVault();
    const stored = vault[key];
    if (stored && stored.savedAt && Date.now() - stored.savedAt < VAULT_TTL_MS) {
      if (stored.notFound) {
        showLinkCache.set(key, null);
        return null;
      }
      if (!stored.imdbId || stored.rtSlug !== undefined) {
        showLinkCache.set(key, stored);
        return stored;
      }
    }

    try {
      let directUrl = stored ? stored.directUrl : null;
      let tvmazeUrl = stored ? stored.tvmazeUrl : null;
      let imdbId = stored ? stored.imdbId : null;
      let score10 = stored ? stored.score10 : null;
      let image = stored ? stored.image : null;
      let rating = stored ? stored.rating : null;

      if (!stored || (!imdbId && !tvmazeUrl)) {
        const data = await fetchJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(clean)}`);
        directUrl = normalizeDirectUrl(data.officialSite || data.url || null);
        tvmazeUrl = data.url || null;
        imdbId = data.externals && data.externals.imdb ? data.externals.imdb : null;
        score10 = data.rating && data.rating.average ? data.rating.average : null;
        image = data.image ? data.image.medium : null;
        rating = score10 ? Math.min(5, Math.max(3, Math.round(score10 / 2))) : null;
      }

      let rtSlug = stored && stored.rtSlug ? stored.rtSlug : null;
      if (imdbId && !rtSlug) {
        try {
          const sparql = `SELECT ?rtId WHERE { ?item wdt:P345 "${imdbId}". OPTIONAL { ?item wdt:P1258 ?rtId. } } LIMIT 1`;
          const wdRes = await fetchJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`);
          const b = wdRes && wdRes.results && wdRes.results.bindings && wdRes.results.bindings[0];
          if (b && b.rtId && b.rtId.value) {
            rtSlug = b.rtId.value;
          }
        } catch {
          // Ignore Wikidata errors gracefully
        }
      }

      const resolved = {
        directUrl,
        tvmazeUrl,
        imdbId,
        rtSlug,
        score10,
        image,
        rating,
        savedAt: Date.now()
      };
      showLinkCache.set(key, resolved);
      vault[key] = resolved;
      saveVault(vault);
      return resolved;
    } catch {
      const miss = { notFound: true, savedAt: Date.now() };
      showLinkCache.set(key, null);
      vault[key] = miss;
      saveVault(vault);
      return null;
    }
  }

  return {
    fetchLiveChannels,
    fetchSkySchedulesForSids,
    fetchLiveStreaming,
    fetchRssFeeds,
    resolveDirectShowLink,
    getVaultStats,
    getStorageReport,
    buildExportVaultJs,
    clearEpgCache,
    clearShowVault
  };
})();
