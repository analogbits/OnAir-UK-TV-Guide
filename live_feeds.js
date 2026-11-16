/* ==========================================================================
   OnAir UK — 100% Live UK TV EPG & Streaming Refresh Engine
   Sources (All Live, Zero Fake Schedules):
     1. Sky EPG Services API (awk.epgsky.com/hawk/linear/services/4101/1)
     2. Sky EPG Linear Schedule API (awk.epgsky.com/hawk/linear/schedule/YYYYMMDD/...)
     3. TVMaze UK & Global Web Streaming Schedule API
     4. What's on Netflix UK RSS & The Guardian TV & Radio RSS (via rss2json)
   ========================================================================== */

const ONAIR_LIVE = (() => {
  const CACHE_TTL_MS = 30 * 60 * 1000;          // 30m default to minimize API pulls
  const LOW_DATA_CACHE_TTL_MS = 120 * 60 * 1000; // 2h in Low-Data mode
  const CHANNELS_TTL_MS = 24 * 60 * 60 * 1000;   // 24h for UK channel lineup
  const STREAMING_TTL_MS = 12 * 60 * 60 * 1000; // 12h for streaming drops
  const RSS_TTL_MS = 2 * 60 * 60 * 1000;        // 2h for news/RSS feeds
  const VAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for reusable show metadata & links
  const STORAGE_KEY = "onair_live_epg_v7";
  const VAULT_STORAGE_KEY = "onair_show_vault_v1";
  const inFlightRequests = new Map();
  const hostBackoffUntil = new Map();
  const feedHealth = {
    sky: { status: "idle", ts: 0, note: "Not queried yet" },
    pluto: { status: "idle", ts: 0, note: "Snapshot / on-demand" },
    tubi: { status: "idle", ts: 0, note: "Snapshot / on-demand" },
    proxy: { status: "idle", ts: 0, note: "Not checked" }
  };

  function getEffectiveCacheTtlMs() {
    try {
      return localStorage.getItem("onair_low_data") === "1" ? LOW_DATA_CACHE_TTL_MS : CACHE_TTL_MS;
    } catch {
      return CACHE_TTL_MS;
    }
  }

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

  // UK & Ireland TV Regions (Sky EPG Bouquet + Sub-Bouquet)
  const REGIONS = [
    { id: "ni", name: "Northern Ireland (incl. RTÉ1, RTÉ2, TG4)", short: "N. Ireland", bouquet: 4104, subBouquet: 33 },
    { id: "ireland", name: "Ireland (RTÉ1, RTÉ2, Virgin, TG4)", short: "Ireland", bouquet: 4104, subBouquet: 50 },
    { id: "london", name: "London", short: "London", bouquet: 4101, subBouquet: 1 },
    { id: "scotland", name: "Scotland (BBC Scot, STV)", short: "Scotland", bouquet: 4102, subBouquet: 35 },
    { id: "wales", name: "Wales (BBC Wales, S4C)", short: "Wales", bouquet: 4104, subBouquet: 32 },
    { id: "nw", name: "North West", short: "North West", bouquet: 4101, subBouquet: 7 },
    { id: "yorkshire", name: "Yorkshire", short: "Yorkshire", bouquet: 4101, subBouquet: 8 },
    { id: "ne", name: "North East", short: "North East", bouquet: 4101, subBouquet: 12 },
    { id: "wm", name: "West Midlands", short: "West Mids", bouquet: 4101, subBouquet: 3 },
    { id: "em", name: "East Midlands", short: "East Mids", bouquet: 4101, subBouquet: 19 },
    { id: "east", name: "East", short: "East", bouquet: 4101, subBouquet: 2 },
    { id: "west", name: "West", short: "West", bouquet: 4101, subBouquet: 4 },
    { id: "south", name: "South", short: "South", bouquet: 4101, subBouquet: 5 },
    { id: "sw", name: "South West", short: "South West", bouquet: 4101, subBouquet: 6 },
    { id: "se", name: "South East", short: "South East", bouquet: 4101, subBouquet: 10 }
  ];

  function getRegion() {
    try {
      const saved = localStorage.getItem("onair_region") || "ni";
      return REGIONS.find((r) => r.id === saved) || REGIONS[0];
    } catch {
      return REGIONS[0];
    }
  }

  function setRegion(regionId) {
    const found = REGIONS.find((r) => r.id === regionId) || REGIONS[0];
    try {
      localStorage.setItem("onair_region", found.id);
    } catch {
      // Ignore storage errors
    }
    return found;
  }

  // Cross-platform channel numbers mapped by lowercase channel name keywords
  const PLATFORM_NUMBERS_BY_NAME = [
    { match: /^bbc one/i, freeview: 1, virgin: 101, bt: 1, freesat: 101, color: "#b91c1c", catchup: "BBC iPlayer" },
    { match: /^bbc two/i, freeview: 2, virgin: 102, bt: 2, freesat: 102, color: "#0f766e", catchup: "BBC iPlayer" },
    { match: /^itv1/i, freeview: 3, virgin: 103, bt: 3, freesat: 103, color: "#0369a1", catchup: "ITVX" },
    { match: /^utv\b/i, freeview: 3, virgin: 103, bt: 3, freesat: 103, color: "#0369a1", catchup: "ITVX" },
    { match: /^stv\b/i, freeview: 3, virgin: 103, bt: 3, freesat: 103, color: "#0284c7", catchup: "STV Player" },
    { match: /^rt[eé]\s*one/i, freeview: 51, virgin: 101, bt: null, freesat: null, color: "#15803d", catchup: "RTÉ Player" },
    { match: /^rt[eé]\s*2|^rt[eé]2/i, freeview: 52, virgin: 102, bt: null, freesat: null, color: "#16a34a", catchup: "RTÉ Player" },
    { match: /^tg4\b/i, freeview: 53, virgin: 104, bt: null, freesat: null, color: "#0f766e", catchup: "TG4 Player" },
    { match: /^virgin one|^virgin media one/i, freeview: null, virgin: 103, bt: null, freesat: null, color: "#dc2626", catchup: "Virgin Media Play" },
    { match: /^virgin two|^virgin media two/i, freeview: null, virgin: 106, bt: null, freesat: null, color: "#b91c1c", catchup: "Virgin Media Play" },
    { match: /^virgin three|^virgin media three/i, freeview: null, virgin: 107, bt: null, freesat: null, color: "#991b1b", catchup: "Virgin Media Play" },
    { match: /^virgin four|^virgin media four/i, freeview: null, virgin: 108, bt: null, freesat: null, color: "#7f1d1d", catchup: "Virgin Media Play" },
    { match: /^channel 4/i, freeview: 4, virgin: 104, bt: 4, freesat: 104, color: "#1d4ed8", catchup: "Channel 4" },
    { match: /^5\s*hd$|^channel 5/i, freeview: 5, virgin: 105, bt: 5, freesat: 105, color: "#4338ca", catchup: "My5" },
    { match: /^itv2/i, freeview: 6, virgin: 115, bt: 6, freesat: 113, color: "#0284c7", catchup: "ITVX" },
    { match: /^bbc alba/i, freeview: 7, virgin: 120, bt: 7, freesat: 109, color: "#0f766e", catchup: "BBC iPlayer" },
    { match: /^bbc four/i, freeview: 9, virgin: 107, bt: 9, freesat: 107, color: "#334155", catchup: "BBC iPlayer" },
    { match: /^itv3/i, freeview: 10, virgin: 117, bt: 10, freesat: 115, color: "#1e40af", catchup: "ITVX" },
    { match: /^sky mix/i, freeview: 11, virgin: null, bt: 11, freesat: null, color: "#2563eb", catchup: "NOW" },
    { match: /^quest\b(?!.*red)/i, freeview: 12, virgin: 137, bt: 17, freesat: 167, color: "#0e7490", catchup: "discovery+" },
    { match: /^e4\b(?!.*extra)/i, freeview: 13, virgin: 106, bt: 13, freesat: 122, color: "#7e22ce", catchup: "Channel 4" },
    { match: /^film4\b(?!.*\+1)/i, freeview: 14, virgin: 428, bt: 14, freesat: 300, color: "#991b1b", catchup: "Channel 4" },
    { match: /^really/i, freeview: 17, virgin: 128, bt: 44, freesat: 160, color: "#0d9488", catchup: "discovery+" },
    { match: /^more4/i, freeview: 18, virgin: 147, bt: 18, freesat: 124, color: "#0d9488", catchup: "Channel 4" },
    { match: /^u&davejavu/i, freeview: 74, virgin: 227, bt: 74, freesat: null, color: "#3f3f46", catchup: "U" },
    { match: /^u&dave/i, freeview: 19, virgin: 127, bt: 19, freesat: 157, color: "#3f3f46", catchup: "U" },
    { match: /^u&drama/i, freeview: 20, virgin: 130, bt: 20, freesat: 158, color: "#9f1239", catchup: "U" },
    { match: /^5 ?usa/i, freeview: 21, virgin: 153, bt: 21, freesat: 129, color: "#1d4ed8", catchup: "My5" },
    { match: /^bbc three/i, freeview: 23, virgin: 108, bt: 23, freesat: 108, color: "#db2777", catchup: "BBC iPlayer" },
    { match: /^u&w/i, freeview: 25, virgin: 125, bt: 25, freesat: 156, color: "#0d9488", catchup: "U" },
    { match: /^itv4/i, freeview: 26, virgin: 118, bt: 26, freesat: 117, color: "#0f766e", catchup: "ITVX" },
    { match: /^u&yesterday/i, freeview: 27, virgin: 129, bt: 27, freesat: 159, color: "#854d0e", catchup: "U" },
    { match: /^itv quiz|^itvbe/i, freeview: 28, virgin: 119, bt: 28, freesat: 118, color: "#be185d", catchup: "ITVX" },
    { match: /^e4 extra/i, freeview: 31, virgin: 146, bt: 31, freesat: 181, color: "#6d28d9", catchup: "Channel 4" },
    { match: /^5star/i, freeview: 32, virgin: 151, bt: 32, freesat: 131, color: "#4f46e5", catchup: "My5" },
    { match: /^5action/i, freeview: 33, virgin: 150, bt: 46, freesat: 132, color: "#b91c1c", catchup: "My5" },
    { match: /^sky arts/i, freeview: 36, virgin: 123, bt: 36, freesat: 147, color: "#6d28d9", catchup: "NOW" },
    { match: /^dmax/i, freeview: 37, virgin: 173, bt: 39, freesat: 165, color: "#1d4ed8", catchup: "discovery+" },
    { match: /^5drama/i, freeview: 38, virgin: 152, bt: 33, freesat: 130, color: "#4f46e5", catchup: "My5" },
    { match: /^quest red/i, freeview: 39, virgin: 170, bt: 40, freesat: 168, color: "#be123c", catchup: "discovery+" },
    { match: /^legend\b(?!.*xtra)/i, freeview: 41, virgin: 149, bt: 41, freesat: 137, color: "#7c2d12", catchup: "Watch Free UK" },
    { match: /^great! action/i, freeview: 42, virgin: 426, bt: 42, freesat: 304, color: "#b91c1c", catchup: "GREAT! player" },
    { match: /^food network/i, freeview: 43, virgin: 282, bt: 43, freesat: 148, color: "#dc2626", catchup: "discovery+" },
    { match: /^challenge/i, freeview: 48, virgin: 139, bt: 48, freesat: 145, color: "#7c3aed", catchup: "Sky" },
    { match: /^4seven/i, freeview: 49, virgin: 148, bt: 49, freesat: 127, color: "#2563eb", catchup: "Channel 4" },
    { match: /^great! ?tv/i, freeview: 50, virgin: 180, bt: 34, freesat: 142, color: "#9333ea", catchup: "GREAT! player" },
    { match: /^great! ?mystery/i, freeview: 50, virgin: null, bt: 50, freesat: 305, color: "#6d28d9", catchup: "GREAT! player" },
    { match: /^great! ?christmas/i, freeview: 52, virgin: null, bt: 52, freesat: 303, color: "#b91c1c", catchup: "GREAT! player" },
    { match: /^u&eden/i, freeview: 57, virgin: 245, bt: 57, freesat: 164, color: "#166534", catchup: "U" },
    { match: /^blaze/i, freeview: 64, virgin: 174, bt: 64, freesat: 162, color: "#ea580c", catchup: "BLAZE" },
    { match: /^tbn uk/i, freeview: 66, virgin: null, bt: 66, freesat: null, color: "#0284c7", catchup: "Live TV" },
    { match: /^true crime\b(?!.*x\b|.*xtra)/i, freeview: 67, virgin: 148, bt: 67, freesat: 143, color: "#991b1b", catchup: "Watch Free UK" },
    { match: /^true crime x/i, freeview: 68, virgin: null, bt: 68, freesat: null, color: "#7f1d1d", catchup: "Watch Free UK" },
    { match: /^legend xtra/i, freeview: 69, virgin: null, bt: 69, freesat: null, color: "#9a3412", catchup: "Watch Free UK" },
    { match: /^rewind tv/i, freeview: 81, virgin: null, bt: 81, freesat: null, color: "#475569", catchup: "Freeview Play" },
    { match: /^talking ?pictures/i, freeview: 82, virgin: 445, bt: 82, freesat: 306, color: "#475569", catchup: "TPTV Encore" },
    { match: /^together/i, freeview: 83, virgin: 136, bt: 83, freesat: 164, color: "#0d9488", catchup: "Freeview Play" },
    { match: /^pbs america/i, freeview: 84, virgin: 187, bt: 84, freesat: 155, color: "#1e3a8a", catchup: "Freeview Play" },
    { match: /^tlc/i, freeview: 12, virgin: 167, bt: 12, freesat: null, color: "#db2777", catchup: "discovery+" },
    { match: /^sky witness/i, freeview: null, virgin: 110, bt: 341, freesat: null, color: "#4338ca", catchup: "NOW" },
    { match: /^sky atlantic/i, freeview: null, virgin: null, bt: 342, freesat: null, color: "#111827", catchup: "NOW" },
    { match: /^u&alibi/i, freeview: null, virgin: 126, bt: 343, freesat: null, color: "#881337", catchup: "NOW" },
    { match: /^u&gold/i, freeview: null, virgin: 124, bt: 344, freesat: null, color: "#ca8a04", catchup: "NOW" },
    { match: /^comedycent|^comedy central/i, freeview: null, virgin: 132, bt: 345, freesat: null, color: "#ea580c", catchup: "NOW" },
    { match: /^sky one/i, freeview: null, virgin: 109, bt: 346, freesat: null, color: "#0f172a", catchup: "NOW" },
    { match: /^sky comedy/i, skyMax: 299, freeview: null, virgin: 112, bt: 347, freesat: null, color: "#d97706", catchup: "NOW" },
    { match: /^sky sci-fi/i, freeview: null, virgin: 139, bt: 348, freesat: null, color: "#1e293b", catchup: "NOW" },
    { match: /^sky crime/i, freeview: null, virgin: 122, bt: 349, freesat: null, color: "#7f1d1d", catchup: "NOW" },
    { match: /^mtv/i, freeview: null, virgin: 134, bt: 351, freesat: null, color: "#18181b", catchup: "Paramount+" },
    { match: /^sky history/i, freeview: null, virgin: 270, bt: 353, freesat: null, color: "#78350f", catchup: "NOW" },
    { match: /^sky nature/i, freeview: null, virgin: 189, bt: 354, freesat: null, color: "#15803d", catchup: "NOW" },
    { match: /^sky ?doc/i, freeview: null, virgin: 188, bt: 355, freesat: null, color: "#0f766e", catchup: "NOW" },
    { match: /^discovery\b(?!.*history|.*sci|.*turbo)/i, freeview: null, virgin: 250, bt: 325, freesat: null, color: "#0369a1", catchup: "discovery+" },
    { match: /^nat geo|^national geo/i, freeview: null, virgin: 266, bt: 317, freesat: null, color: "#ca8a04", catchup: "Disney+" },
    { match: /^sky.*prem/i, freeview: null, virgin: 401, bt: 501, freesat: null, color: "#6b21a8", catchup: "NOW" },
    { match: /^sky.*select|^sky.*mummy|^sky ?m:i/i, freeview: null, virgin: 402, bt: 502, freesat: null, color: "#7e22ce", catchup: "NOW" },
    { match: /^sky.*hits|^sky.*christmas/i, freeview: null, virgin: 403, bt: 503, freesat: null, color: "#9333ea", catchup: "NOW" },
    { match: /^sky.*greats/i, freeview: null, virgin: 404, bt: 504, freesat: null, color: "#7c3aed", catchup: "NOW" },
    { match: /^sky.*family/i, freeview: null, virgin: 406, bt: 506, freesat: null, color: "#2563eb", catchup: "NOW" },
    { match: /^disney\+? ?cine/i, freeview: null, virgin: 405, bt: null, freesat: null, color: "#1d4ed8", catchup: "Disney+" },
    { match: /^sky.*action/i, freeview: null, virgin: 407, bt: 507, freesat: null, color: "#b91c1c", catchup: "NOW" },
    { match: /^sky.*comedy/i, skyMin: 300, freeview: null, virgin: 408, bt: 508, freesat: null, color: "#d97706", catchup: "NOW" },
    { match: /^sky.*thriller/i, freeview: null, virgin: 409, bt: 509, freesat: null, color: "#334155", catchup: "NOW" },
    { match: /^sky.*drama/i, freeview: null, virgin: 410, bt: 510, freesat: null, color: "#9f1239", catchup: "NOW" },
    { match: /^sky.*sci-fi|^sky.*horror|^sky ?scfi/i, freeview: null, virgin: 411, bt: 511, freesat: null, color: "#1e293b", catchup: "NOW" },
    { match: /^tnt ?sports ?1/i, freeview: null, virgin: 527, bt: 408, freesat: null, color: "#15803d", catchup: "discovery+" },
    { match: /^tnt ?sports ?2/i, freeview: null, virgin: 528, bt: 409, freesat: null, color: "#15803d", catchup: "discovery+" },
    { match: /^tnt ?sports ?3/i, freeview: null, virgin: 529, bt: 410, freesat: null, color: "#15803d", catchup: "discovery+" },
    { match: /^tnt ?sports ?4/i, freeview: null, virgin: 530, bt: 411, freesat: null, color: "#15803d", catchup: "discovery+" },
    { match: /^tnt ?sports ?ult/i, freeview: null, virgin: 531, bt: 433, freesat: null, color: "#166534", catchup: "discovery+" },
    { match: /^sky ?sp(?:orts)? ?news/i, freeview: null, virgin: 509, bt: 418, freesat: null, color: "#dc2626", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?main/i, freeview: null, virgin: 501, bt: 419, freesat: null, color: "#1e3a8a", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)?\+|skysp\+/i, freeview: null, virgin: 508, bt: 427, freesat: null, color: "#1d4ed8", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?f'?ball|^sky ?sp(?:orts)? ?football/i, freeview: null, virgin: 503, bt: 421, freesat: null, color: "#1e40af", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?cricket/i, freeview: null, virgin: 504, bt: 422, freesat: null, color: "#0f766e", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?golf/i, freeview: null, virgin: 505, bt: 423, freesat: null, color: "#15803d", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?f1/i, freeview: null, virgin: 506, bt: 424, freesat: null, color: "#b91c1c", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?tennis/i, freeview: null, virgin: 507, bt: 425, freesat: null, color: "#65a30d", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?nfl/i, freeview: null, virgin: 510, bt: 426, freesat: null, color: "#1e293b", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?racing/i, freeview: null, virgin: 511, bt: 428, freesat: null, color: "#78350f", catchup: "NOW" },
    { match: /^sky ?sp(?:orts)? ?mix/i, freeview: null, virgin: 512, bt: 429, freesat: null, color: "#0284c7", catchup: "NOW" },
    { match: /^skyspboxoff/i, freeview: null, virgin: null, bt: null, freesat: null, color: "#1e3a8a", catchup: "NOW" },
    { match: /^sky ?sp/i, freeview: null, virgin: 502, bt: 420, freesat: null, color: "#1e3a8a", catchup: "NOW" },
    { match: /^colors ?cineplex/i, freeview: null, virgin: null, bt: 397, freesat: null, color: "#7c3aed", catchup: "Live TV" },
    { match: /^s4c/i, freeview: 4, virgin: 166, bt: null, freesat: 104, color: "#dc2626", catchup: "BBC iPlayer" },
    { match: /^bbc ?scotland/i, freeview: 9, virgin: 108, bt: null, freesat: 106, color: "#1d4ed8", catchup: "BBC iPlayer" },
    { match: /^bbc news/i, freeview: 231, virgin: 601, bt: 231, freesat: 200, color: "#dc2626", catchup: "BBC iPlayer" },
    { match: /^bbc parl/i, freeview: 232, virgin: 605, bt: 232, freesat: 201, color: "#334155", catchup: "BBC iPlayer" },
    { match: /^sky news/i, freeview: 233, virgin: 603, bt: 233, freesat: 202, color: "#b91c1c", catchup: "YouTube" },
    { match: /^gb news/i, freeview: 236, virgin: 604, bt: 236, freesat: 216, color: "#1d4ed8", catchup: "YouTube" },
    { match: /^al jazeera/i, freeview: null, virgin: 622, bt: 251, freesat: 203, color: "#0f766e", catchup: "YouTube" },
    { match: /^france 24/i, freeview: null, virgin: 624, bt: 255, freesat: 205, color: "#0284c7", catchup: "YouTube" },
    { match: /^euronews/i, freeview: null, virgin: 625, bt: 257, freesat: 204, color: "#1e3a8a", catchup: "YouTube" },
    { match: /^nhk world/i, freeview: null, virgin: 626, bt: 272, freesat: 209, color: "#334155", catchup: "Live TV" },
    { match: /^cbbc/i, freeview: 201, virgin: 701, bt: 201, freesat: 205, color: "#16a34a", catchup: "BBC iPlayer" },
    { match: /^cbeebies/i, freeview: 202, virgin: 702, bt: 202, freesat: 206, color: "#eab308", catchup: "BBC iPlayer" },
    { match: /^cartoon net/i, freeview: null, virgin: 704, bt: 466, freesat: null, color: "#18181b", catchup: "NOW" },
    { match: /^boomerang/i, freeview: null, virgin: 706, bt: 467, freesat: null, color: "#2563eb", catchup: "NOW" },
    { match: /^nickelodeon/i, freeview: null, virgin: 712, bt: 468, freesat: null, color: "#ea580c", catchup: "Paramount+" },
    { match: /^nicktoons|^nick spongebob/i, freeview: null, virgin: 714, bt: 469, freesat: null, color: "#f97316", catchup: "Paramount+" },
    { match: /^nick ?jr/i, freeview: null, virgin: 715, bt: 470, freesat: null, color: "#0ea5e9", catchup: "Paramount+" },
    { match: /^cartoonito/i, freeview: null, virgin: 707, bt: 471, freesat: null, color: "#db2777", catchup: "NOW" },
    { match: /^sky kids/i, freeview: null, virgin: null, bt: 472, freesat: null, color: "#7c3aed", catchup: "NOW" }
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
      ["onair_live_epg_v3", "onair_live_epg_v4", "onair_live_epg_v5", "onair_live_epg_v6"].forEach((oldKey) => {
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

  const debugLogs = [];
  const MAX_DEBUG_LOGS = 150;

  function logDebug(source, message, level = "info", ms = null) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      timeStr: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      source: source || "System",
      message: String(message || ""),
      level,
      ms
    };
    debugLogs.unshift(entry);
    if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.length = MAX_DEBUG_LOGS;
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("onair:debug-log", { detail: entry }));
      }
    } catch {
      // Ignore event dispatch errors
    }
  }

  function getDebugLogs() {
    return [...debugLogs];
  }

  function clearDebugLogs() {
    debugLogs.length = 0;
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("onair:debug-log"));
      }
    } catch {
      // Ignore
    }
  }

  async function fetchJson(url, timeoutMs = 10000) {
    let host = "";
    try {
      host = new URL(url, typeof location !== "undefined" && location.href.startsWith("http") ? location.href : "https://localhost").hostname;
    } catch {
      host = "";
    }
    const shortUrl = String(url).replace(/^https?:\/\//, "").slice(0, 78);
    const backoffUntil = host ? hostBackoffUntil.get(host) || 0 : 0;
    if (backoffUntil > Date.now()) {
      logDebug(host || "Network", `Skipped (cooldown active): ${shortUrl}`, "warn");
      throw new Error(`Rate-limit cooldown for ${host}`);
    }

    if (inFlightRequests.has(url)) {
      return inFlightRequests.get(url);
    }

    const reqPromise = (async () => {
      const t0 = Date.now();
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
        const elapsed = Date.now() - t0;
        if (res.status === 429 || res.status === 503) {
          if (host) hostBackoffUntil.set(host, Date.now() + 5 * 60 * 1000);
          logDebug(host || "HTTP", `HTTP ${res.status} — 5m backoff triggered (${shortUrl})`, "warn", elapsed);
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.ok) {
          logDebug(host || "HTTP", `HTTP ${res.status} (${shortUrl})`, "error", elapsed);
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        logDebug(host || "HTTP", `200 OK (${shortUrl})`, "ok", elapsed);
        return json;
      } catch (err) {
        if (!/HTTP (429|503|\d+)/.test(err && err.message || "")) {
          logDebug(host || "Network", `${err && err.name === "AbortError" ? "Timeout" : (err && err.message) || "Fetch failed"} (${shortUrl})`, "error", Date.now() - t0);
        }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        inFlightRequests.delete(url);
      }
    })();

    inFlightRequests.set(url, reqPromise);
    return reqPromise;
  }

  async function fetchChunksPolitely(items, mapper, concurrency = 2, delayMs = 100) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const slice = items.slice(i, i + concurrency);
      const batchRes = await Promise.all(slice.map(mapper));
      results.push(...batchRes);
      if (i + concurrency < items.length && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return results;
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

  // 1. Fetch Live Full UK & Ireland Channel Lineup from Sky EPG API (with multi-tier backup)
  async function fetchLiveChannels(force = false, regionId = null) {
    const region = regionId ? (REGIONS.find((r) => r.id === regionId) || getRegion()) : getRegion();
    const cache = loadCache();
    const byRegion = cache.channelsByRegion || {};
    const cachedReg = byRegion[region.id];
    if (!force && cachedReg && cachedReg.ver === 7 && Date.now() - cachedReg.ts < CHANNELS_TTL_MS) {
      logDebug("Channels", `Cache hit for region "${region.short}" (${cachedReg.list.length} channels)`, "info");
      return cachedReg.list;
    }

    try {
      const data = await fetchJson(`https://awk.epgsky.com/hawk/linear/services/${region.bouquet}/${region.subBouquet}`);
      const services = (data.services || []).filter((s) => !s.adult && Number(s.c) < 800);

      const channels = services.map((s) => {
        const rawCode = String(s.c || "").trim();
        const isSkyRadio = /^0\d+/.test(rawCode);
        const skyNum = Number(rawCode);
        const name = s.t;
        const category = inferCategoryFromChannel(rawCode, s.sg, name);
        const isTimeshift = /\+1\b/i.test(name);
        const meta = isTimeshift
          ? null
          : PLATFORM_NUMBERS_BY_NAME.find(
              (m) => m.match.test(name) && (!m.skyMin || skyNum >= m.skyMin) && (!m.skyMax || skyNum <= m.skyMax)
            );

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
            sky: isSkyRadio ? rawCode : skyNum,
            freeview: meta ? meta.freeview : null,
            virgin: meta ? meta.virgin : null,
            bt: meta ? meta.bt : null,
            freesat: meta ? meta.freesat : null
          }
        };
      });

      if (channels.length > 0) {
        cache.channelsByRegion = {
          ...(cache.channelsByRegion || {}),
          [region.id]: { ts: Date.now(), ver: 7, list: channels }
        };
        cache.channels = { ts: Date.now(), ver: 7, list: channels };
        saveCache(cache);
        return channels;
      }
    } catch {
      // Fall through to backups
    }

    // Backup #1: stale localStorage channels for region or default
    if (cachedReg && Array.isArray(cachedReg.list) && cachedReg.list.length > 0) {
      return cachedReg.list;
    }
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

      function parseTv24TimeToMin(timeStr) {
    const m = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3].toLowerCase();
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  function normTv24ChName(n) {
    return String(n || "")
      .toLowerCase()
      .replace(/\b(hd|uhd|sd|lon|london|uk|ni|scot|wal|wales)\b/g, "")
      .replace(/[^a-z0-9+]/g, "")
      .trim();
  }

  async function fetchTv24DayMap(isoDate, skipCorsLol = false) {
    const targetUrl = `https://tv24.co.uk/x/tvguide/freeview/0/${isoDate}/0`;
    let raw = null;
    const proxyList = buildProxyUrls(targetUrl, false).filter((u) => !skipCorsLol || !u.includes("api.cors.lol"));
    for (const url of proxyList) {
      try {
        const res = await fetchJson(url, 9000);
        if (Array.isArray(res) && res.length > 0) {
          raw = res;
          break;
        }
      } catch {
        // Try next proxy
      }
    }
    if (!raw) return null;

    const byCh = {};
    raw.forEach((item) => {
      const html = item && item.schedules;
      if (!html) return;
      const chMatch = html.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      if (!chMatch) return;
      const chName = chMatch[1].trim();
      const nk = normTv24ChName(chName);
      if (!nk) return;

      const rows = [];
      const re = /<span class="time">([^<]+)<\/span>.*?<span class="actual">([^<]+)<\/span>/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const startMin = parseTv24TimeToMin(m[1]);
        const title = m[2]
          .replace(/&amp;/g, "&")
          .replace(/&#039;|&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .trim();
        if (startMin !== null && title) {
          rows.push({ title, startMin });
        }
      }
      if (!rows.length) return;

      const mapped = [];
      for (let i = 0; i < rows.length; i++) {
        let s = rows[i].startMin;
        if (i > 0 && s < rows[i - 1].startMin) s += 24 * 60;
        let e = i + 1 < rows.length ? rows[i + 1].startMin : s + 60;
        if (e <= s) e += 24 * 60;
        if (e <= 360 || s >= 24 * 60) continue;
        const clampedStart = Math.max(360, s);
        const clampedEnd = Math.min(24 * 60, e);
        if (clampedEnd > clampedStart) {
          mapped.push({ title: rows[i].title, startMin: clampedStart, endMin: clampedEnd });
        }
      }
      if (mapped.length) byCh[nk] = mapped;
    });

    return Object.keys(byCh).length ? byCh : null;
  }

  function matchTvmazeNetwork(chName, netName) {
    const net = String(netName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!net) return false;
    let ch = String(chName || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(hd|uhd|sd|lon|london|ni|scot|wal|wales)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (ch === "5") ch = "channel 5";
    if (ch === "utv" || ch === "stv") ch = "itv1";
    if (ch === "sky showcase") ch = "sky one";
    if (ch === "virgin one") ch = "virgin media one";
    if (ch === "virgin two") ch = "virgin media two";

    if (ch === net) return true;
    if ((ch === "itv1" && (net === "itv" || net === "itv1")) || (ch === "bbc one" && net === "bbc one") || (ch === "bbc two" && net === "bbc two")) {
      return true;
    }
    if (ch.length >= 4 && net.length >= 4 && (ch === net || net.startsWith(ch + " ") || ch.startsWith(net + " "))) {
      return true;
    }
    return false;
  }

  function getBbcGenomeServiceSlugs(chName, regionId = "ni") {
    const n = String(chName || "").toLowerCase();
    if (/^bbc one/i.test(n)) {
      const primary =
        n.includes("ni") || regionId === "ni"
          ? "service_bbc_one_northern_ireland"
          : n.includes("scot") || regionId === "scotland"
          ? "service_bbc_one_scotland"
          : n.includes("wal") || regionId === "wales"
          ? "service_bbc_one_wales"
          : "service_bbc_one_london";
      const all = [
        primary,
        "service_bbc_one_london",
        "service_bbc_one_northern_ireland",
        "service_bbc_one_scotland",
        "service_bbc_one_wales"
      ];
      return [...new Set(all)];
    }
    if (/^bbc two/i.test(n)) {
      const primary =
        n.includes("ni") || regionId === "ni"
          ? "service_bbc_two_northern_ireland"
          : n.includes("wal") || regionId === "wales"
          ? "service_bbc_two_wales"
          : n.includes("scot") || regionId === "scotland"
          ? "service_bbc_two_scotland"
          : "service_bbc_two_england";
      const all = [
        primary,
        "service_bbc_two_england",
        "service_bbc_two_northern_ireland",
        "service_bbc_two_wales",
        "service_bbc_two_scotland"
      ];
      return [...new Set(all)];
    }
    if (/^bbc three/i.test(n)) return ["service_bbc_three"];
    if (/^bbc four/i.test(n)) return ["service_bbc_four"];
    if (/^bbc scotland/i.test(n)) return ["service_bbc_scotland"];
    if (/^bbc alba/i.test(n)) return ["service_bbc_alba"];
    if (/^bbc news/i.test(n)) return ["service_bbc_news"];
    if (/^cbbc/i.test(n)) return ["service_cbbc"];
    if (/^cbeebies/i.test(n)) return ["service_cbeebies"];
    return [];
  }

  function getBbcGenomeServiceSlug(chName, regionId = "ni") {
    return getBbcGenomeServiceSlugs(chName, regionId)[0] || null;
  }

  async function fetchBbcGenomeAcrossRegions(chName, regionId, isoDate) {
    const slugs = getBbcGenomeServiceSlugs(chName, regionId);
    for (const slug of slugs) {
      const evs = await fetchBbcGenomeService(slug, isoDate).catch(() => null);
      if (evs && evs.length) return { events: evs, slug };
    }
    return null;
  }

  function lookupTv24Events(tv24Map, chName) {
    if (!tv24Map) return null;
    const nk = normTv24ChName(chName);
    const candidates = [nk, nk.replace(/1$/, "")];
    if (/^(utv|stv|itv)/.test(nk)) {
      candidates.push("itv1", "itv", "utv", "stv");
    }
    if (/^bbcone/.test(nk)) {
      candidates.push("bbcone", "bbconelondon", "bbconeni", "bbconescotland", "bbconewales");
    }
    if (/^bbctwo/.test(nk)) {
      candidates.push("bbctwo", "bbctwoengland", "bbctwoni", "bbctwowales", "bbctwoscotland");
    }
    if (/^channel4|^c4/.test(nk)) {
      candidates.push("channel4", "c4");
    }
    if (/^5$|^channel5/.test(nk)) {
      candidates.push("5", "channel5");
    }
    for (const key of candidates) {
      if (key && tv24Map[key] && tv24Map[key].length) return tv24Map[key];
    }
    return null;
  }

  const DEFAULT_CUSTOM_PROXY = "https://summer-hill-0053.mickyfitz13.workers.dev/?url=";

  function getCustomProxyPrefix() {
    try {
      const v = (localStorage.getItem("onair_custom_proxy") || "").trim();
      return v && /^https?:\/\//i.test(v) ? v : DEFAULT_CUSTOM_PROXY;
    } catch {
      return DEFAULT_CUSTOM_PROXY;
    }
  }

  async function fetchBbcGenomeService(serviceSlug, isoDate) {
    const buildId = "CJZAoJ_Mrgpy51nbuC1ZK";
    const targetUrl = `https://genome.ch.bbc.co.uk/_next/data/${buildId}/schedules/${serviceSlug}/${isoDate}.json`;
    const isLocalHttp = typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.protocol.startsWith("http");
    const isFile = typeof location !== "undefined" && location.protocol === "file:";
    const customProxy = getCustomProxyPrefix();
    const urls = isLocalHttp
      ? [`/api/proxy?url=${encodeURIComponent(targetUrl)}`]
      : isFile
      ? [`http://127.0.0.1:8765/api/proxy?url=${encodeURIComponent(targetUrl)}`]
      : customProxy
      ? [`${customProxy}${encodeURIComponent(targetUrl)}`]
      : [`https://api.cors.lol/?url=${encodeURIComponent(targetUrl)}`];
    for (const url of urls) {
      try {
        const res = await fetchJson(url, 8000);
        const items = res && res.pageProps && res.pageProps.result && res.pageProps.result.schedule && res.pageProps.result.schedule.items;
        if (Array.isArray(items) && items.length > 0) {
          const dayStartMs = Date.parse(`${isoDate}T00:00:00Z`);
          const events = [];
          items.forEach((group, idx) => {
            const it = Array.isArray(group) ? group[0] : group;
            if (!it || !it.title || !it.start) return;
            const stMs = Date.parse(it.start);
            if (Number.isNaN(stMs)) return;
            const startMin = Math.floor((stMs - dayStartMs) / 60000);
            const durMin = typeof it.duration === "number" ? Math.round(it.duration / 60) : 30;
            const endMin = startMin + Math.max(5, durMin);
            if (endMin <= 360 || startMin >= 24 * 60) return;
            const syn = (it.synopses && (it.synopses.short || it.synopses.medium || it.synopses.long)) || "";
            events.push({
              id: `bbc-${it._id || `${isoDate}-${idx}`}`,
              title: it.title,
              desc: syn || `${it.title} (${isoDate})`,
              isRepeat: Boolean(it.isRepeat),
              startMin: Math.max(360, startMin),
              endMin: Math.min(24 * 60, endMin)
            });
          });
          if (events.length) return events;
        }
      } catch {
        // Try next proxy
      }
    }
    return null;
  }

  const timeMachineMemCache = new Map();

  async function fetchTimeMachineDay(isoDate, channelsList = [], onBackgroundUpdate = null, force = false) {
    const region = getRegion();
    const memKey = `${isoDate}_${region.id}`;
    if (!force && timeMachineMemCache.has(memKey)) {
      logDebug("TimeMachine", `Session cache hit for ${isoDate} (${region.short})`, "info");
      return timeMachineMemCache.get(memKey);
    }
    // Polite multi-pass cap: BBC One immediately, then stagger remaining terrestrial BBC channels (4s, 9s)
    // plus a single retry at 7s if BBC One missed on initial load (zero 429 bursts)
    const bbcChs = (channelsList || [])
      .filter((c) => c && c.sid && !c.plutoSlug && !c.tubiId && /^bbc (one|two|four)\b/i.test(c.name || "") && getBbcGenomeServiceSlug(c.name, region.id))
      .slice(0, 3);
    const bbc1 = bbcChs.find((c) => /^bbc one\b/i.test(c.name || "")) || bbcChs[0] || null;
    const bbcRest = bbcChs.filter((c) => c !== bbc1);
    logDebug("TimeMachine", `Fetching ${isoDate} (${region.short}) — BBC1=${bbc1 ? bbc1.name : "none"}, BBC rest=${bbcRest.map((c) => c.name).join(", ") || "none"}`, "info");

    const isLocalProxy =
      typeof location !== "undefined" &&
      (location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");

    const customProxy = getCustomProxyPrefix();
    const [tv24Map, tvmGbList, tvmIeList, bbc1Res] = await Promise.all([
      fetchTv24DayMap(isoDate, !(isLocalProxy || customProxy)).catch(() => null),
      fetchJson(`https://api.tvmaze.com/schedule?country=GB&date=${isoDate}`).catch(() => []),
      fetchJson(`https://api.tvmaze.com/schedule?country=IE&date=${isoDate}`).catch(() => []),
      bbc1 ? fetchBbcGenomeAcrossRegions(bbc1.name, region.id, isoDate).catch(() => null) : Promise.resolve(null)
    ]);
    const bbc1Events = bbc1Res ? bbc1Res.events : null;
    const bbcBySid = {};
    if (bbc1 && !lookupTv24Events(tv24Map, bbc1.name) && bbc1Events && bbc1Events.length) {
      bbcBySid[bbc1.sid] = bbc1Events;
    }
    const tvmList = [
      ...(Array.isArray(tvmGbList) ? tvmGbList : []),
      ...(Array.isArray(tvmIeList) ? tvmIeList : [])
    ];

    const schedulesBySid = {};
    let totalEvents = 0;
    const sources = [];
    if (tv24Map) sources.push("tv24.co.uk");
    if (Object.keys(bbcBySid).length) sources.push("BBC Genome");
    if (Array.isArray(tvmGbList) && tvmGbList.length) sources.push("TVMaze UK");
    if (Array.isArray(tvmIeList) && tvmIeList.length) sources.push("TVMaze IE");

    (channelsList || []).forEach((ch) => {
      if (!ch || !ch.sid || ch.plutoSlug || ch.tubiId) return;
      if (bbcBySid[ch.sid] && bbcBySid[ch.sid].length) {
        schedulesBySid[ch.sid] = bbcBySid[ch.sid].map((ev) => ({
          id: ev.id,
          channelId: ch.id,
          sid: ch.sid,
          dayOffset: 0,
          title: ev.title,
          genre: ch.category || "Entertainment",
          rating: "PG",
          ep: isoDate,
          desc: ev.desc,
          cast: ch.category || "TV",
          stars: null,
          isNew: false,
          isRepeat: ev.isRepeat,
          isLiveData: true,
          thisWeek: false,
          interests: inferInterestsFromEvent(ev.title, ev.desc, ch.category || "Entertainment"),
          startMin: ev.startMin,
          endMin: ev.endMin
        }));
        totalEvents += schedulesBySid[ch.sid].length;
        return;
      }
      const tv24Events = lookupTv24Events(tv24Map, ch.name);
      if (tv24Events && tv24Events.length) {
        schedulesBySid[ch.sid] = tv24Events.map((ev, idx) => ({
          id: `tm-${isoDate}-${ch.sid}-${idx}`,
          channelId: ch.id,
          sid: ch.sid,
          dayOffset: 0,
          title: ev.title,
          genre: ch.category || "Entertainment",
          rating: "PG",
          ep: isoDate,
          desc: `Historical broadcast on ${ch.name} (${isoDate}).`,
          cast: ch.category || "TV",
          stars: null,
          isNew: false,
          isRepeat: false,
          isLiveData: true,
          thisWeek: false,
          interests: inferInterestsFromEvent(ev.title, "", ch.category || "Entertainment"),
          startMin: ev.startMin,
          endMin: ev.endMin
        }));
        totalEvents += schedulesBySid[ch.sid].length;
        return;
      }

      if (Array.isArray(tvmList) && tvmList.length) {
        const matches = tvmList
          .filter((ep) => {
            const net = ep.show && ep.show.network && ep.show.network.name ? ep.show.network.name : "";
            return matchTvmazeNetwork(ch.name, net);
          })
          .map((ep) => {
            const parts = (ep.airtime || "12:00").split(":");
            const startMin = Math.max(360, Number(parts[0]) * 60 + Number(parts[1] || 0));
            const endMin = Math.min(24 * 60, startMin + (ep.runtime || 60));
            if (endMin <= startMin) return null;
            const show = ep.show || {};
            const genre = mapTvmazeShowToCategory(show) || ch.category || "Entertainment";
            return {
              id: `tm-tvm-${ep.id}`,
              channelId: ch.id,
              sid: ch.sid,
              dayOffset: 0,
              title: show.name || ep.name || "Untitled",
              genre,
              rating: "PG",
              ep: ep.season && ep.number ? `Series ${ep.season}, Ep ${ep.number}` : ep.name || genre,
              desc: (ep.summary || show.summary || `${show.name || "Programme"} (${isoDate})`).replace(/<[^>]+>/g, "").trim(),
              cast: genre,
              stars: show.rating && show.rating.average ? Number((show.rating.average / 2).toFixed(1)) : null,
              isNew: true,
              isRepeat: false,
              isLiveData: true,
              thisWeek: false,
              interests: inferInterestsFromEvent(show.name || "", ep.summary || "", genre),
              startMin,
              endMin
            };
          })
          .filter(Boolean);
        if (matches.length) {
          schedulesBySid[ch.sid] = matches;
          totalEvents += matches.length;
        }
      }
    });

    const bbc1Slug = getBbcGenomeServiceSlug("BBC One", region.id) || "service_bbc_one_northern_ireland";
    const missingArchives = !isLocalProxy && !customProxy && !tv24Map && Object.keys(bbcBySid).length === 0;
    const issueNote = missingArchives
      ? "Public CORS proxies (cors.lol / corsproxy / allorigins) blocked BBC Genome & tv24 on GitHub Pages — showing TVMaze UK + IE only. Wait ~60s before refreshing, or set a Custom CORS Relay in Settings."
      : "";
    const result = {
      isoDate,
      schedulesBySid,
      totalEvents,
      sourceLabel: sources.length ? sources.join(" + ") : "No archive data",
      issueNote,
      tv24Url: `https://tv24.co.uk/tv/${isoDate}`,
      genomeUrl: `https://genome.ch.bbc.co.uk/schedules/${bbc1Slug}/${isoDate}`
    };
    if (totalEvents > 0) timeMachineMemCache.set(memKey, result);

    const applyBbcEvents = (ch, evs) => {
      if (!ch || !evs || !evs.length) return false;
      result.schedulesBySid[ch.sid] = evs.map((ev) => ({
        id: ev.id,
        channelId: ch.id,
        sid: ch.sid,
        dayOffset: 0,
        title: ev.title,
        genre: ch.category || "Entertainment",
        rating: "PG",
        ep: isoDate,
        desc: ev.desc,
        cast: ch.category || "TV",
        stars: null,
        isNew: false,
        isRepeat: ev.isRepeat,
        isLiveData: true,
        thisWeek: false,
        interests: inferInterestsFromEvent(ev.title, ev.desc, ch.category || "Entertainment"),
        startMin: ev.startMin,
        endMin: ev.endMin
      }));
      result.totalEvents = Object.values(result.schedulesBySid).reduce((sum, arr) => sum + arr.length, 0);
      if (!result.sourceLabel.includes("BBC Genome")) {
        result.sourceLabel = result.sourceLabel === "No archive data" ? "BBC Genome" : `BBC Genome + ${result.sourceLabel}`;
      }
      timeMachineMemCache.set(memKey, result);
      if (typeof onBackgroundUpdate === "function") onBackgroundUpdate(result);
      return true;
    };

    // Build staggered follow-up queue with large gaps (4.5s, 9.5s, 14.5s) to capture missed terrestrial BBC channels safely
    const followUpQueue = [...bbcRest];
    if (bbc1 && !bbcBySid[bbc1.sid] && !lookupTv24Events(tv24Map, bbc1.name)) {
      followUpQueue.push(bbc1);
    }
    const pendingFollowUps = followUpQueue.filter((c) => !lookupTv24Events(tv24Map, c.name));
    pendingFollowUps.forEach((ch, idx) => {
      const delayMs = 4500 + idx * 5000;
      setTimeout(async () => {
        try {
          const bbcRes = await fetchBbcGenomeAcrossRegions(ch.name, region.id, isoDate).catch(() => null);
          applyBbcEvents(ch, bbcRes ? bbcRes.events : null);
        } catch {
          // Ignore background failure
        }
      }, delayMs);
    });

    return result;
  }

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

    const repoPastDay =
      dayOffset < 0 && typeof window !== "undefined" && window.ONAIR_PAST_EPG && window.ONAIR_PAST_EPG[dateStr]
        ? window.ONAIR_PAST_EPG[dateStr]
        : null;

    sids.forEach((sid) => {
      const hasEvents = dayCache[sid] && Array.isArray(dayCache[sid].events) && dayCache[sid].events.length > 0;
      const isSparseTvm = hasEvents && String(dayCache[sid].events[0].id || "").startsWith("tvm-") && repoPastDay;
      const isPastDayReuse = dayOffset < 0 && hasEvents && !isSparseTvm;
      if (isPastDayReuse || (!force && !isSparseTvm && dayCache[sid] && Date.now() - dayCache[sid].ts < getEffectiveCacheTtlMs())) {
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
        fetchChunksPolitely(
          chunks,
          (chunk) =>
            fetchJson(`https://awk.epgsky.com/hawk/linear/schedule/${dateStr}/${chunk.join(",")}`)
              .then((r) => {
                feedHealth.sky = { status: "live", ts: Date.now(), note: "Connected (awk.epgsky.com)" };
                return r;
              })
              .catch(() => ({ schedule: [] })),
          2,
          100
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

              const isRepeat = /\(R\)|\brepeat\b/i.test(ev.sy || "") || /\(R\)|\brepeat\b/i.test(rawTitle);
              const tvmazeKeys = Object.keys(tvmazeMap || {});
              const isTvMazeNew = Boolean(
                !isRepeat &&
                  titleKey &&
                  (tvmazeMap[titleKey] ||
                    tvmazeKeys.some(
                      (k) => k.length >= 7 && (titleKey.endsWith(" " + k) || titleKey.startsWith(k + " "))
                    ))
              );

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
                isNew: Boolean(ev.new) || isTvMazeNew,
                isRepeat,
                isLiveData: true,
                thisWeek: Boolean(ev.new) || isTvMazeNew,
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

  // Backup #1 (Freeview UK 165-channel full schedule), Backup #2 (tv24.co.uk), Backup #3 (TVMaze UK), Backup #4 (stale cache)
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

        let fvByChannel = repoPastDay || (cache[`fv_${dateStr}`] && cache[`fv_${dateStr}`].byCh ? cache[`fv_${dateStr}`].byCh : null);
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
        let tv24ByChannel = undefined;
        for (const sid of missingFromSky) {
          const rawName = chNameBySid.get(String(sid)) || "";
          const nk = normChName(rawName);
          const fvEvents = fvByChannel && (fvByChannel[nk] || fvByChannel[nk.replace(/1$/, "")]);

          if (fvEvents && fvEvents.length > 0) {
            const mappedFv = fvEvents
              .map((ev) => {
                const isCompact = typeof ev.st === "number";
                const title = isCompact ? ev.t : ev.main_title;
                const subTitle = isCompact ? ev.s2 : ev.secondary_title;
                const stSec = isCompact ? ev.st : Math.floor(new Date(ev.start_time).getTime() / 1000);
                const durMin = isCompact ? ev.d : parseIsoDurMins(ev.duration);
                const startMin = Math.floor((stSec - dayStartSec) / 60);
                const endMin = startMin + durMin;
                if (endMin <= 360 || startMin >= 24 * 60) return null;
                const clampedStart = Math.max(360, startMin);
                const clampedEnd = Math.min(24 * 60, endMin);
                if (clampedEnd <= clampedStart) return null;
                const genre = mapFreeviewGenre(isCompact ? ev.g : ev.genre, title, chCatBySid.get(String(sid)));
                return {
                  id: `fv-${ev.uuid || `${sid}-${stSec}`}`,
                  channelId: `sky-${sid}`,
                  sid,
                  dayOffset,
                  title: title || "Untitled",
                  genre,
                  rating: "PG",
                  ep: subTitle || genre,
                  desc: subTitle ? `${title}: ${subTitle}` : `${title} (${rawName})`,
                  cast: genre,
                  stars: null,
                  isNew: false,
                  isLiveData: true,
                  thisWeek: false,
                  interests: inferInterestsFromEvent(title || "", subTitle || "", genre),
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
          // Backup #2: tv24.co.uk single-day schedule backup (fetched lazily once per day if needed)
          if (tv24ByChannel === undefined) {
            tv24ByChannel = await fetchTv24DayMap(isoDate).catch(() => null);
          }
          const tv24Events = tv24ByChannel && (tv24ByChannel[nk] || tv24ByChannel[nk.replace(/1$/, "")]);
          if (tv24Events && tv24Events.length > 0) {
            const mappedTv24 = tv24Events.map((ev, idx) => ({
              id: `tv24-${dateStr}-${sid}-${idx}`,
              channelId: `sky-${sid}`,
              sid,
              dayOffset,
              title: ev.title,
              genre: chCatBySid.get(String(sid)) || "Entertainment",
              rating: "PG",
              ep: chCatBySid.get(String(sid)) || "TV",
              desc: `${ev.title} (${rawName})`,
              cast: chCatBySid.get(String(sid)) || "TV",
              stars: null,
              isNew: false,
              isRepeat: false,
              isLiveData: true,
              thisWeek: false,
              interests: inferInterestsFromEvent(ev.title, "", chCatBySid.get(String(sid)) || "Entertainment"),
              startMin: ev.startMin,
              endMin: ev.endMin
            }));
            result[sid] = mappedTv24;
            dayCache[sid] = { ts: Date.now(), events: mappedTv24 };
            continue;
          }

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
      if ((!stored.imdbId || stored.rtSlug !== undefined) && stored.castList !== undefined) {
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
      let castList = stored && Array.isArray(stored.castList) ? stored.castList : null;
      let crewList = stored && Array.isArray(stored.crewList) ? stored.crewList : null;

      if (!stored || (!imdbId && !tvmazeUrl) || castList === null) {
        try {
          const data = await fetchJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(clean)}&embed%5B%5D=cast&embed%5B%5D=crew`);
          directUrl = directUrl || normalizeDirectUrl(data.officialSite || data.url || null);
          tvmazeUrl = tvmazeUrl || data.url || null;
          imdbId = imdbId || (data.externals && data.externals.imdb ? data.externals.imdb : null);
          score10 = score10 || (data.rating && data.rating.average ? data.rating.average : null);
          image = image || (data.image ? data.image.medium : null);
          rating = rating || (score10 ? Math.min(5, Math.max(3, Math.round(score10 / 2))) : null);
          const emb = data._embedded || {};
          castList = (Array.isArray(emb.cast) ? emb.cast : [])
            .slice(0, 6)
            .map((c) => {
              const actor = c && c.person && c.person.name ? c.person.name.trim() : "";
              const role = c && c.character && c.character.name ? c.character.name.trim() : "";
              if (!actor) return "";
              return role ? `${actor} (${role})` : actor;
            })
            .filter(Boolean);
          const crewPriority = { Creator: 1, Showrunner: 2, Director: 3, Writer: 4, "Executive Producer": 5 };
          const rawCrew = (Array.isArray(emb.crew) ? emb.crew : [])
            .map((c) => ({
              name: c && c.person && c.person.name ? c.person.name.trim() : "",
              type: c && c.type ? String(c.type).trim() : "",
              prio: crewPriority[c && c.type] || 99
            }))
            .filter((c) => c.name)
            .sort((a, b) => a.prio - b.prio);
          const seenCrew = new Set();
          crewList = [];
          for (const c of rawCrew) {
            if (seenCrew.has(c.name)) continue;
            seenCrew.add(c.name);
            crewList.push(c.type ? `${c.name} (${c.type})` : c.name);
            if (crewList.length >= 4) break;
          }
        } catch {
          // Movie/film fallback via Wikidata SPARQL (director, cast, IMDb, Rotten Tomatoes)
          const safeTitle = clean.replace(/["\\]/g, "").trim();
          const filmQuery = `SELECT ?directorLabel ?imdb ?rt (GROUP_CONCAT(DISTINCT ?castLabel; separator="|") AS ?cast) WHERE { ?item wdt:P31/wdt:P279* wd:Q11424; rdfs:label "${safeTitle}"@en. OPTIONAL { ?item wdt:P57 ?director. } OPTIONAL { ?item wdt:P161 ?cast. } OPTIONAL { ?item wdt:P345 ?imdb. } OPTIONAL { ?item wdt:P1258 ?rt. } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?directorLabel ?imdb ?rt LIMIT 1`;
          const wdFilm = await fetchJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(filmQuery)}`, 7000);
          const row = wdFilm && wdFilm.results && wdFilm.results.bindings && wdFilm.results.bindings[0];
          if (!row) throw new Error("Not found on TVMaze or Wikidata");
          if (row.imdb && row.imdb.value) imdbId = imdbId || row.imdb.value;
          if (row.rt && row.rt.value) rtSlug = row.rt.value;
          if (row.cast && row.cast.value) {
            castList = row.cast.value.split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6);
          }
          if (row.directorLabel && row.directorLabel.value) {
            crewList = [`${row.directorLabel.value.trim()} (Director)`];
          }
        }
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
        castList: castList || [],
        crewList: crewList || [],
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

  function mapPlutoCategory(plutoCat, name) {
    const t = `${plutoCat || ""} ${name || ""}`.toLowerCase();
    if (/movie|film|cinema|western|thriller|sci-fi|horror|christmas/i.test(t)) return "Film";
    if (/kid|cartoon|nick|anime|teen/i.test(t)) return "Kids";
    if (/news|weather/i.test(t)) return "News";
    if (/sport|poker|wrestling|mma|motorsport|nfl|golf/i.test(t)) return "Sport";
    if (/doc|history|science|nature|mythbuster|crime|mystery/i.test(t)) return "Documentary";
    if (/music|mtv|vevo|concert/i.test(t)) return "Music";
    if (/drama|soap|classic tv/i.test(t)) return "Drama";
    return "Entertainment";
  }

  function buildProxyUrls(targetUrl, includeDirect = true) {
    const isLocalHttp = typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.protocol.startsWith("http");
    const isFile = typeof location !== "undefined" && location.protocol === "file:";
    const customProxy = getCustomProxyPrefix();
    const list = [];
    if (isLocalHttp) list.push(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
    else if (isFile) list.push(`http://127.0.0.1:8765/api/proxy?url=${encodeURIComponent(targetUrl)}`);
    if (customProxy) list.push(`${customProxy}${encodeURIComponent(targetUrl)}`);
    if (includeDirect) list.push(targetUrl);
    list.push(`https://api.cors.lol/?url=${encodeURIComponent(targetUrl)}`);
    list.push(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
    list.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
    return list;
  }

  function mapSeedChannels(list, platformKey) {
    const colorMap = {
      Film: "#6b21a8",
      Kids: "#ea580c",
      Sport: "#16a34a",
      News: "#dc2626",
      Music: "#7c3aed",
      Documentary: "#b45309",
      Drama: "#be185d",
      Entertainment: platformKey === "pluto" ? "#111827" : "#fa382f"
    };
    return (Array.isArray(list) ? list : []).map((s) => ({
      id: s.id,
      sid: s.sid || s.id,
      num: s.num || 0,
      name: s.name,
      short: s.short,
      category: s.category || "Entertainment",
      hd: true,
      catchup: platformKey === "pluto" ? "Pluto TV" : "Tubi",
      color: colorMap[s.category] || (platformKey === "pluto" ? "#111827" : "#fa382f"),
      ...(s.plutoSlug ? { plutoSlug: s.plutoSlug } : {}),
      ...(s.tubiId ? { tubiId: s.tubiId } : {}),
      numbers: {
        freeview: null,
        sky: null,
        virgin: null,
        bt: null,
        freesat: null,
        pluto: platformKey === "pluto" ? (s.num || 0) : null,
        tubi: platformKey === "tubi" ? (s.num || 0) : null
      }
    }));
  }

  async function fetchPlutoTvData(dayOffset = 0, force = false) {
    const dateStr = getSkyDateString(dayOffset);
    const cache = loadCache();
    const cached = cache[`pluto_${dateStr}`];
    if (!force && cached && cached.ts && Date.now() - cached.ts < getEffectiveCacheTtlMs() && Array.isArray(cached.channels) && cached.channels.length) {
      feedHealth.pluto = { status: "cached", ts: cached.ts, note: `Cached (${cached.channels.length} ch)` };
      return { channels: cached.channels, schedules: cached.schedules || {} };
    }

    const dayStart = new Date();
    dayStart.setHours(6, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 0);

    const midnight = new Date(dayStart);
    midnight.setHours(0, 0, 0, 0);
    const midnightMs = midnight.getTime();

    // Pluto TV caps timelines per channel from `start`; for Today, start at max(06:00, now - 2h)
    // so current & evening/night programmes are never truncated.
    const queryStart = dayOffset === 0
      ? new Date(Math.max(dayStart.getTime(), Date.now() - 2 * 60 * 60 * 1000))
      : dayStart;

    const targetUrl = `https://api.pluto.tv/v2/channels?start=${encodeURIComponent(queryStart.toISOString())}&stop=${encodeURIComponent(dayEnd.toISOString())}`;
    let rawList = null;
    for (const url of buildProxyUrls(targetUrl, true)) {
      try {
        const res = await fetchJson(url);
        if (Array.isArray(res) && res.length > 0) {
          rawList = res;
          break;
        }
      } catch {
        // Try next proxy
      }
    }

    // Prefer any live/cached schedules, or fall back to today's full-day snapshot
    const snap = typeof window !== "undefined" && window.ONAIR_FAST_EPG_SNAPSHOT;
    const snapSchedules =
      snap && (snap.dateStr === dateStr || dayOffset === 0) && snap.plutoSchedules
        ? snap.plutoSchedules
        : {};
    if (!rawList) {
      if (cached && Array.isArray(cached.channels) && cached.channels.length && cached.schedules && Object.keys(cached.schedules).length) {
        feedHealth.pluto = { status: "cached", ts: cached.ts || Date.now(), note: `Cached (${cached.channels.length} ch)` };
        return { channels: cached.channels, schedules: cached.schedules };
      }
      const seedPluto = (typeof window !== "undefined" && window.ONAIR_FAST_SEED && window.ONAIR_FAST_SEED.pluto) || [];
      feedHealth.pluto = {
        status: Object.keys(snapSchedules).length ? "cached" : "error",
        ts: Date.now(),
        note: Object.keys(snapSchedules).length ? `Snapshot (${snap.dateStr})` : "Unavailable"
      };
      return { channels: mapSeedChannels(seedPluto, "pluto"), schedules: snapSchedules };
    }

    const channels = [];
    const schedules = {};
    let autoNum = 1000;

    rawList.forEach((ch) => {
      if (!ch || !ch._id || !ch.name) return;
      const chId = `pluto-${ch._id}`;
      const num = ch.number && Number(ch.number) > 0 ? Number(ch.number) : autoNum++;
      const category = mapPlutoCategory(ch.category, ch.name);
      const colorMap = {
        Film: "#6b21a8",
        Kids: "#ea580c",
        News: "#dc2626",
        Sport: "#15803d",
        Documentary: "#0f766e",
        Music: "#db2777",
        Drama: "#881337",
        Entertainment: "#111827"
      };

      channels.push({
        id: chId,
        sid: ch._id,
        plutoSlug: ch.slug || ch._id,
        name: ch.name,
        short: makeShortCode(ch.name),
        color: colorMap[category] || "#111827",
        category,
        hd: true,
        catchup: "Pluto TV",
        numbers: {
          pluto: num,
          freeview: null,
          sky: null,
          virgin: null,
          bt: null,
          freesat: null
        }
      });

      const events = (ch.timelines || [])
        .map((tl, idx) => {
          const stMs = Date.parse(tl.start);
          const enMs = Date.parse(tl.stop);
          if (Number.isNaN(stMs) || Number.isNaN(enMs)) return null;
          const startMin = Math.floor((stMs - midnightMs) / 60000);
          const endMin = Math.floor((enMs - midnightMs) / 60000);
          if (endMin <= 360 || startMin >= 24 * 60) return null;
          const clampedStart = Math.max(360, startMin);
          const clampedEnd = Math.min(24 * 60, endMin);
          if (clampedEnd <= clampedStart) return null;

          const epObj = tl.episode || {};
          const genre = mapPlutoCategory(epObj.genre || ch.category, tl.title);
          const actors = epObj.clip && Array.isArray(epObj.clip.actors) && epObj.clip.actors.length
            ? epObj.clip.actors.slice(0, 4).join(", ")
            : genre;

          return {
            id: `pluto-${ch._id}-${tl._id || idx}`,
            title: tl.title || "Untitled",
            desc: epObj.description || `${ch.name} live free streaming on Pluto TV UK.`,
            genre,
            ep: epObj.season && epObj.number ? `Series ${epObj.season}, Ep ${epObj.number}` : genre,
            rating: epObj.rating || "12",
            cast: actors,
            stars: null,
            isNew: false,
            isLiveData: true,
            thisWeek: false,
            interests: inferInterestsFromEvent(tl.title || "", epObj.description || "", genre),
            startMin: clampedStart,
            endMin: clampedEnd
          };
        })
        .filter(Boolean);

      schedules[chId] = events;
    });

    cache[`pluto_${dateStr}`] = { ts: Date.now(), channels, schedules };
    saveCache(cache);
    feedHealth.pluto = { status: "live", ts: Date.now(), note: `Live (${channels.length} ch)` };
    return { channels, schedules };
  }

  async function fetchTubiLiveData(dayOffset = 0, force = false) {
    const dateStr = getSkyDateString(dayOffset);
    const cache = loadCache();
    const cached = cache[`tubi_${dateStr}`];
    if (!force && cached && cached.ts && Date.now() - cached.ts < getEffectiveCacheTtlMs() && Array.isArray(cached.channels)) {
      feedHealth.tubi = { status: "cached", ts: cached.ts, note: `Cached (${cached.channels.length} ch)` };
      return { channels: cached.channels, schedules: cached.schedules || {} };
    }

    // 1. Get Tubi live channel IDs & category names (cached 24h)
    let idList = null;
    let catById = {};
    if (!force && cache.tubiMeta && Date.now() - cache.tubiMeta.ts < CHANNELS_TTL_MS && Array.isArray(cache.tubiMeta.ids) && cache.tubiMeta.ids.length) {
      idList = cache.tubiMeta.ids;
      catById = cache.tubiMeta.catById || {};
    } else {
      const livePageUrl = "https://tubitv.com/live";
      for (const proxyUrl of buildProxyUrls(livePageUrl, false)) {
        try {
          const res = await fetch(proxyUrl);
          if (!res.ok) continue;
          const html = await res.text();
          const m = html.match(/window\.__data\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
          if (!m) continue;
          const data = JSON.parse(m[1].replace(/\bundefined\b/g, "null"));
          const containers = (data.epg && data.epg.contentIdsByContainer && data.epg.contentIdsByContainer.tubitv_us_linear) || [];
          const seen = new Set();
          const ids = [];
          const cats = {};
          containers.forEach((c) => {
            const cname = c.name || "";
            (c.contents || []).forEach((cid) => {
              const sid = String(cid);
              if (!seen.has(sid)) {
                seen.add(sid);
                ids.push(sid);
                cats[sid] = cname;
              }
            });
          });
          if (ids.length > 0) {
            idList = ids;
            catById = cats;
            cache.tubiMeta = { ts: Date.now(), ids, catById };
            saveCache(cache);
            break;
          }
        } catch {
          // Try next proxy
        }
      }
    }

    if (!idList || idList.length === 0) {
      const seedTubi = (typeof window !== "undefined" && window.ONAIR_FAST_SEED && window.ONAIR_FAST_SEED.tubi) || [];
      if (seedTubi.length) {
        idList = seedTubi.map((s) => s.tubiId).filter(Boolean);
        seedTubi.forEach((s) => { if (s.tubiId) catById[s.tubiId] = s.category || ""; });
      } else {
        if (cached && Array.isArray(cached.channels) && cached.channels.length) {
          return { channels: cached.channels, schedules: cached.schedules || {} };
        }
        return { channels: [], schedules: {} };
      }
    }

    // 2. Fetch Tubi EPG programming in chunks of 20 IDs
    const allRows = [];
    for (let i = 0; i < idList.length; i += 20) {
      const chunk = idList.slice(i, i + 20);
      const apiUrl = `https://epg.production-public.tubi.io/content/epg/programming?platform=web&content_id=${chunk.join(",")}`;
      let chunkOk = false;
      for (const url of buildProxyUrls(apiUrl, true)) {
        try {
          const res = await fetchJson(url);
          if (res && Array.isArray(res.rows)) {
            allRows.push(...res.rows);
            chunkOk = true;
            break;
          }
        } catch {
          // Try next URL
        }
      }
      if (!chunkOk && i === 0) break;
    }

    if (allRows.length === 0) {
      if (cached && Array.isArray(cached.channels) && cached.channels.length && cached.schedules && Object.keys(cached.schedules).length) {
        feedHealth.tubi = { status: "cached", ts: cached.ts || Date.now(), note: `Cached (${cached.channels.length} ch)` };
        return { channels: cached.channels, schedules: cached.schedules };
      }
      const seedTubi = (typeof window !== "undefined" && window.ONAIR_FAST_SEED && window.ONAIR_FAST_SEED.tubi) || [];
      const snap = typeof window !== "undefined" && window.ONAIR_FAST_EPG_SNAPSHOT;
      const snapSchedules =
        snap && (snap.dateStr === dateStr || dayOffset === 0) && snap.tubiSchedules
          ? snap.tubiSchedules
          : {};
      feedHealth.tubi = {
        status: Object.keys(snapSchedules).length ? "cached" : "error",
        ts: Date.now(),
        note: Object.keys(snapSchedules).length ? `Snapshot (${snap.dateStr})` : "Unavailable"
      };
      return { channels: mapSeedChannels(seedTubi, "tubi"), schedules: snapSchedules };
    }

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    midnight.setDate(midnight.getDate() + dayOffset);
    const midnightMs = midnight.getTime();

    const channels = [];
    const schedules = {};
    const colorMap = {
      Film: "#6b21a8",
      Kids: "#ea580c",
      News: "#dc2626",
      Sport: "#15803d",
      Documentary: "#0f766e",
      Music: "#db2777",
      Drama: "#881337",
      Entertainment: "#fa382f"
    };

    allRows.forEach((row, idx) => {
      if (!row || !row.content_id || !row.title) return;
      const cid = String(row.content_id);
      const chId = `tubi-${cid}`;
      const category = mapPlutoCategory(catById[cid] || "", row.title);

      channels.push({
        id: chId,
        sid: cid,
        tubiId: cid,
        name: row.title,
        short: makeShortCode(row.title),
        color: colorMap[category] || "#fa382f",
        category,
        hd: true,
        catchup: "Tubi",
        numbers: {
          tubi: idx + 1,
          pluto: null,
          freeview: null,
          sky: null,
          virgin: null,
          bt: null,
          freesat: null
        }
      });

      const events = (row.programs || [])
        .map((p, pIdx) => {
          const stMs = Date.parse(p.start_time);
          const enMs = Date.parse(p.end_time);
          if (Number.isNaN(stMs) || Number.isNaN(enMs)) return null;
          const startMin = Math.floor((stMs - midnightMs) / 60000);
          const endMin = Math.floor((enMs - midnightMs) / 60000);
          if (endMin <= 360 || startMin >= 24 * 60) return null;
          const clampedStart = Math.max(360, startMin);
          const clampedEnd = Math.min(24 * 60, endMin);
          if (clampedEnd <= clampedStart) return null;

          const rating = p.ratings && p.ratings[0] ? p.ratings[0].value : "12";
          const img = p.images && ((p.images.poster && p.images.poster[0]) || (p.images.thumbnail && p.images.thumbnail[0])) || null;
          return {
            id: `tubi-${cid}-${p.id || pIdx}`,
            title: p.title || row.title,
            desc: p.description || row.description || `${row.title} live free streaming on Tubi.`,
            genre: category,
            ep: p.season_number && p.episode_number ? `Series ${p.season_number}, Ep ${p.episode_number}` : (p.episode_title || category),
            rating,
            cast: category,
            image: img,
            stars: null,
            isNew: false,
            isLiveData: true,
            thisWeek: false,
            interests: inferInterestsFromEvent(p.title || "", p.description || "", category),
            startMin: clampedStart,
            endMin: clampedEnd
          };
        })
        .filter(Boolean);

      schedules[chId] = events;
    });

    cache[`tubi_${dateStr}`] = { ts: Date.now(), channels, schedules };
    saveCache(cache);
    feedHealth.tubi = { status: "live", ts: Date.now(), note: `Live (${channels.length} ch)` };
    return { channels, schedules };
  }

  function getFeedHealth() {
    return {
      ...feedHealth,
      effectiveTtlMins: Math.round(getEffectiveCacheTtlMs() / 60000),
      backoffHosts: [...hostBackoffUntil.entries()].filter(([, until]) => until > Date.now()).map(([h]) => h)
    };
  }

  return {
    REGIONS,
    getRegion,
    setRegion,
    fetchLiveChannels,
    fetchPlutoTvData,
    fetchTubiLiveData,
    fetchSkySchedulesForSids,
    fetchTimeMachineDay,
    fetchLiveStreaming,
    fetchRssFeeds,
    resolveDirectShowLink,
    getVaultStats,
    getStorageReport,
    getFeedHealth,
    getDebugLogs,
    clearDebugLogs,
    logDebug,
    buildExportVaultJs,
    clearEpgCache,
    clearShowVault
  };
})();
