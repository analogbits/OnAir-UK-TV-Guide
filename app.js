/* ==========================================================================
   OnAir UK — Interactive TV Guide, Streaming & What to Watch Application
   ========================================================================== */

(() => {
  const { PLATFORMS, CHANNEL_CATEGORIES, INTEREST_CATEGORIES, CHANNELS, STREAMING_CATALOGUE } = ONAIR_DATA;

  const START_HOUR = 0; // 00:00 (full 24-hour guide)
  const END_HOUR = 24; // 24:00
  let PIXELS_PER_MIN = Number(localStorage.getItem("onair_epg_zoom") || 4); // 240px per hour

  // Migrate any legacy rt_* localStorage keys once so saved items are never lost
  [
    ["rt_platform", "onair_platform"],
    ["rt_watchlist", "onair_watchlist"],
    ["rt_favorites", "onair_favorites"],
    ["rt_reminders", "onair_reminders"]
  ].forEach(([oldKey, newKey]) => {
    try {
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldVal);
      }
      if (oldVal !== null) localStorage.removeItem(oldKey);
    } catch {
      // ignore
    }
  });

  // Persistent State
  const state = {
    view: "epg",
    platform: localStorage.getItem("onair_platform") || "sky",
    epgCategory: "All",
    epgChannelQuery: "",
    dayOffset: 0,
    nowNextCategory: "All",
    wtwWeekFilter: "All",
    wtwModeFilter: "All",
    wtwMinStars: 0,
    feedSource: "All",
    interests: new Set(JSON.parse(localStorage.getItem("onair_interests") || "[]")),
    streamPlatform: "All",
    streamType: "All",
    streamGenre: "All",
    streamWindow: "All",
    streamSort: "rating",
    searchQuery: "",
    searchFilter: "all",
    searchPlatformOnly: false,
    favorites: new Set(JSON.parse(localStorage.getItem("onair_favorites") || "[]")),
    watchlist: JSON.parse(localStorage.getItem("onair_watchlist") || "[]"),
    reminders: new Set(JSON.parse(localStorage.getItem("onair_reminders") || "[]")),
    reminderItems: JSON.parse(localStorage.getItem("onair_reminder_items") || "[]"),
    theme: localStorage.getItem("onair_theme") || "system",
    refreshMins: Number(localStorage.getItem("onair_refresh_mins") || 30),
    lowDataMode: localStorage.getItem("onair_low_data") === "1",
    debugMode: localStorage.getItem("onair_debug_mode") === "1",
    seasonOverride: localStorage.getItem("onair_season_override") || "auto",
    guideMode: localStorage.getItem("onair_guide_mode") || "seasonal",
    seasonalSourceFilter: "all",
    wtwAheadDayOffset: 0,
    wtwAheadFilter: "All",
    timeMachineDate: null,
    defaultView: localStorage.getItem("onair_default_view") || "epg",
    epgDensity: localStorage.getItem("onair_epg_density") || "comfortable",
    epgZoom: Number(localStorage.getItem("onair_epg_zoom") || 4),
    hideTeleshopping: localStorage.getItem("onair_hide_teleshopping") === "1",
    hoverRevealNames: localStorage.getItem("onair_hover_reveal") !== "0",
    reminderLeadMins: Number(localStorage.getItem("onair_reminder_lead") || 10)
  };
  let timeMachineEpg = null;

  // Live Data Stores (100% Live EPG, Zero Fake Schedules)
  function buildFastSeedChannels() {
    const seed = (typeof window !== "undefined" && window.ONAIR_FAST_SEED) || {};
    const colorMap = {
      Film: "#6b21a8",
      Kids: "#ea580c",
      Sport: "#16a34a",
      News: "#dc2626",
      Music: "#7c3aed",
      Documentary: "#b45309",
      Drama: "#be185d"
    };
    const mapList = (arr, key) =>
      (Array.isArray(arr) ? arr : []).map((s) => ({
        id: s.id,
        sid: s.sid || s.id,
        num: s.num || 0,
        name: s.name,
        short: s.short,
        category: s.category || "Entertainment",
        hd: true,
        catchup: key === "pluto" ? "Pluto TV" : "Tubi",
        color: colorMap[s.category] || (key === "pluto" ? "#111827" : "#fa382f"),
        ...(s.plutoSlug ? { plutoSlug: s.plutoSlug } : {}),
        ...(s.tubiId ? { tubiId: s.tubiId } : {}),
        numbers: {
          freeview: null,
          sky: null,
          virgin: null,
          bt: null,
          freesat: null,
          pluto: key === "pluto" ? (s.num || 0) : null,
          tubi: key === "tubi" ? (s.num || 0) : null
        }
      }));
    return [...mapList(seed.pluto, "pluto"), ...mapList(seed.tubi, "tubi")];
  }
  let liveChannels = [...CHANNELS, ...buildFastSeedChannels()];
  const liveEpgByDay = new Map(); // dayOffset -> { [sid]: events[] }
  (() => {
    const snap = typeof window !== "undefined" && window.ONAIR_FAST_EPG_SNAPSHOT;
    if (!snap) return;
    const d = new Date();
    const todayStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    if (snap.dateStr === todayStr) {
      liveEpgByDay.set(0, { ...(snap.plutoSchedules || {}), ...(snap.tubiSchedules || {}) });
    }
  })();
  let liveStreamingItems = [];
  let liveFeedItems = [];
  const livePlutoFetchedDays = new Set();
  const liveTubiFetchedDays = new Set();

  function getPlutoTubiStreamingItems() {
    const dayMap = liveEpgByDay.get(0) || {};
    const nowMin = getNowMinutes();
    const out = [];
    const seen = new Set();
    let plutoCount = 0;
    let tubiCount = 0;

    liveChannels.forEach((ch) => {
      const isPluto = Boolean(ch.plutoSlug);
      const isTubi = Boolean(ch.tubiId);
      if (!isPluto && !isTubi) return;
      if (isPluto && plutoCount >= 35) return;
      if (isTubi && tubiCount >= 25) return;
      const progs = dayMap[ch.sid] || [];
      if (!progs.length) return;
      const picked = progs.find((p) => nowMin >= p.startMin && nowMin < p.endMin) || progs.find((p) => p.endMin > nowMin) || progs[0];
      if (!picked || !picked.title) return;
      const clean = picked.title.toLowerCase().trim();
      if (seen.has(clean)) return;
      seen.add(clean);

      const type = picked.genre === "Film" ? "Films" : picked.genre === "Documentary" ? "Documentaries" : picked.genre === "Sport" ? "Sport" : "TV Series";
      const genre = ["Drama", "Thriller", "Comedy", "Sci-Fi", "Documentary", "Sport"].includes(picked.genre) ? picked.genre : (picked.genre === "Film" ? "Drama" : "Comedy");
      out.push({
        id: `fast-${isPluto ? "pluto" : "tubi"}-${ch.id}`,
        title: picked.title,
        platform: isPluto ? "Pluto TV" : "Tubi",
        platformColor: isPluto ? "#18181b" : "#fa382f",
        type,
        genre,
        seasons: `${ch.name} • Free Live/On-Demand`,
        year: new Date().getFullYear(),
        rating: 4,
        age: picked.rating || "12",
        thisWeek: true,
        isLiveData: true,
        desc: picked.desc || `${picked.title} streaming free on ${isPluto ? "Pluto TV" : "Tubi"} (${ch.name}).`,
        interests: Array.isArray(picked.interests) && picked.interests.length ? picked.interests : [genre]
      });
      if (isPluto) plutoCount++;
      else tubiCount++;
    });
    return out;
  }

  const dynamicSimilarStreamMap = new Map();

  function sanitizeUkOfficialSite(url) {
    if (!url) return "";
    if (/tvmaze\.com|thetvdb\.com|wikidata\.org|wikipedia\.org|peacocktv\.com|hulu\.com|10play\.com\.au|threenow\.co\.nz|ctv\.ca|nbc\.com|cbs\.com|abc\.com|fox\.com/i.test(url)) {
      return "";
    }
    return url;
  }

  function resolveUkPlatformForShow(title = "", rawPlatform = "", fallbackPlatform = "") {
    const t = String(title || "").toLowerCase();
    const p = String(rawPlatform || "").toLowerCase();
    if (/\b(traitors|drag race|masterchef|strictly|doctor who|eastenders|silent witness|line of duty|happy valley|blue lights|vigil|ludwig|ghosts|gavin\s*&\s*stacey|peaky blinders|call the midwife|death in paradise|beyond paradise|shetland|strike|wolf hall|inside no\.?\s*9|cunk|race across the world|gladiators|mortimer\s*&\s*whitehouse|would i lie to you|qi\b|have i got news|blankety blank|pointless|the repair shop|countryfile|antiques roadshow|springwatch|autumnwatch|winterwatch|storyville|panorama|louis theroux|top gear)\b/i.test(t) || /\bbbc|iplayer|rt[eé]\b/i.test(p)) {
      return { platform: "BBC iPlayer", color: "#ff4c98" };
    }
    if (/\b(love island|i'm a celebrity|coronation street|emmerdale|vera\b|endeavour|grace\b|mcdonald\s*&\s*dodds|unforgotten|broadchurch|trigger point|red eye|bates vs the post office|britain's got talent|the masked singer|the chase|tipping point|deal or no deal|wheel of fortune|good morning britain|lorraine|this morning|loose women)\b/i.test(t) || /\bitv|utv|stv\b/i.test(p)) {
      return { platform: "ITVX", color: "#2563eb" };
    }
    if (/\b(bake off|taskmaster|gogglebox|married at first sight|first dates|location,\s*location|grand designs|hollyoaks|derry girls|inbetweeners|peep show|friday night dinner|big boys|hunted|24 hours in police|24 hours in a&e|8 out of 10 cats|the last leg|countdown)\b/i.test(t) || /\bchannel 4|all 4|more4|e4|film4\b/i.test(p)) {
      return { platform: "Channel 4", color: "#1d4ed8" };
    }
    if (/\bchannel 5|my5|5star|5usa\b/i.test(p)) return { platform: "My5", color: "#4338ca" };
    if (/\bnetflix\b/i.test(p)) return { platform: "Netflix", color: "#e50914" };
    if (/\bdisney\b/i.test(p)) return { platform: "Disney+", color: "#0063e5" };
    if (/\bapple\b/i.test(p)) return { platform: "Apple TV+", color: "#1d1d1f" };
    if (/\bparamount\b/i.test(p)) return { platform: "Paramount+", color: "#0064ff" };
    if (/\bsky|now\b|hbo|max\b|peacock\b/i.test(p)) return { platform: "Sky / NOW", color: "#0f766e" };
    if (/\bpluto\b/i.test(p)) return { platform: "Pluto TV", color: "#18181b" };
    if (/\btubi\b/i.test(p)) return { platform: "Tubi", color: "#fa382f" };
    if (/\bprime|amazon\b/i.test(p)) return { platform: "Prime Video", color: "#00a8e1" };
    if (fallbackPlatform && WATCH_PLATFORMS && WATCH_PLATFORMS[fallbackPlatform]) {
      return { platform: fallbackPlatform, color: WATCH_PLATFORMS[fallbackPlatform].color };
    }
    return { platform: rawPlatform || "BBC iPlayer", color: "#334155" };
  }

  function getMergedCatalogue() {
    const fastItems = getPlutoTubiStreamingItems();
    const seen = new Set(STREAMING_CATALOGUE.map((i) => i.title.toLowerCase()));
    const extras = [];
    [...liveStreamingItems, ...fastItems].forEach((i) => {
      const k = String(i.title || "").toLowerCase();
      if (!k || seen.has(k)) return;
      seen.add(k);
      const ukMap = resolveUkPlatformForShow(i.title, i.platform);
      extras.push({
        ...i,
        platform: ukMap.platform,
        platformColor: ukMap.color,
        officialSite: sanitizeUkOfficialSite(i.officialSite)
      });
    });
    return [...extras, ...STREAMING_CATALOGUE];
  }

  function getSchedule(channelId, dayOffset) {
    const ch = liveChannels.find((c) => c.id === channelId);
    if (!ch || !ch.sid) return [];
    if (state.timeMachineDate && timeMachineEpg) {
      return timeMachineEpg[ch.sid] || [];
    }
    const dayMap = liveEpgByDay.get(dayOffset);
    if (!dayMap || !dayMap[ch.sid]) return null; // null = not fetched yet
    return dayMap[ch.sid];
  }

  async function ensureSchedulesForChannels(channels, dayOffset, force = false) {
    if (state.timeMachineDate) return;
    if (state.platform === "pluto" && ONAIR_LIVE.fetchPlutoTvData) {
      const hasPlutoForDay = !force && livePlutoFetchedDays.has(dayOffset);
      if (!hasPlutoForDay) {
        livePlutoFetchedDays.add(dayOffset);
        const pluto = await ONAIR_LIVE.fetchPlutoTvData(dayOffset, force).catch(() => ({ channels: [], schedules: {} }));
        if (pluto.channels && pluto.channels.length) {
          const existingIds = new Set(liveChannels.map((c) => c.id));
          const newPluto = pluto.channels.filter((c) => !existingIds.has(c.id));
          if (newPluto.length) liveChannels = [...liveChannels, ...newPluto];
          const currentMap = liveEpgByDay.get(dayOffset) || {};
          pluto.channels.forEach((c) => {
            const evs = pluto.schedules[c.id] || pluto.schedules[c.sid] || [];
            currentMap[c.id] = evs;
            if (c.sid) currentMap[c.sid] = evs;
          });
          liveEpgByDay.set(dayOffset, currentMap);
          if (state.view === "epg") renderEPG(false);
          else if (state.view === "now-next") renderNowNext(false);
          else if (state.view === "what-to-watch") renderWhatToWatch();
          return;
        }
      }
    }

    if (state.platform === "tubi" && ONAIR_LIVE.fetchTubiLiveData) {
      const hasTubiForDay = !force && liveTubiFetchedDays.has(dayOffset);
      if (!hasTubiForDay) {
        liveTubiFetchedDays.add(dayOffset);
        const tubi = await ONAIR_LIVE.fetchTubiLiveData(dayOffset, force).catch(() => ({ channels: [], schedules: {} }));
        if (tubi.channels && tubi.channels.length) {
          const existingIds = new Set(liveChannels.map((c) => c.id));
          const newTubi = tubi.channels.filter((c) => !existingIds.has(c.id));
          if (newTubi.length) liveChannels = [...liveChannels, ...newTubi];
          const currentMap = liveEpgByDay.get(dayOffset) || {};
          tubi.channels.forEach((c) => {
            const evs = tubi.schedules[c.id] || tubi.schedules[c.sid] || [];
            currentMap[c.id] = evs;
            if (c.sid) currentMap[c.sid] = evs;
          });
          liveEpgByDay.set(dayOffset, currentMap);
          if (state.view === "epg") renderEPG(false);
          else if (state.view === "now-next") renderNowNext(false);
          else if (state.view === "what-to-watch") renderWhatToWatch();
          return;
        }
      }
    }

    const dayMap = liveEpgByDay.get(dayOffset) || {};
    const missingSids = channels
      .filter((c) => !c.plutoSlug && !c.tubiId)
      .map((c) => c.sid)
      .filter((sid) => sid && (force || !dayMap[sid]));

    if (missingSids.length === 0) return;

    // Fetch in batches of 40 SIDs so UI updates progressively
    for (let i = 0; i < missingSids.length; i += 40) {
      const batch = missingSids.slice(i, i + 40);
      const fetched = await ONAIR_LIVE.fetchSkySchedulesForSids(batch, dayOffset, force).catch(() => ({}));
      const currentMap = liveEpgByDay.get(dayOffset) || {};
      Object.assign(currentMap, fetched);
      liveEpgByDay.set(dayOffset, currentMap);

      if (state.view === "epg") renderEPG(false);
      else if (state.view === "now-next") renderNowNext(false);
      else if (state.view === "what-to-watch") renderWhatToWatch();
    }
  }

  // DOM References
  const el = {
    navTabs: document.querySelectorAll(".nav-tab"),
    viewPanels: document.querySelectorAll(".view-panel"),
    platformPills: document.getElementById("platformPills"),
    regionSelect: document.getElementById("regionSelect"),
    tmPickerWrap: document.getElementById("tmPickerWrap"),
    timeMachineBtn: document.getElementById("timeMachineBtn"),
    timeMachineBtnLabel: document.getElementById("timeMachineBtnLabel"),
    tmPopover: document.getElementById("tmPopover"),
    timeMachineBanner: document.getElementById("timeMachineBanner"),
    epgCategoryPills: document.getElementById("epgCategoryPills"),
    dateStrip: document.getElementById("dateStrip"),
    epgScrollContainer: document.getElementById("epgScrollContainer"),
    epgGrid: document.getElementById("epgGrid"),
    nowNextPlatformPills: document.getElementById("nowNextPlatformPills"),
    nowNextCategoryPills: document.getElementById("nowNextCategoryPills"),
    nowNextPlatformLabel: document.getElementById("nowNextPlatformLabel"),
    nowNextClock: document.getElementById("nowNextClock"),
    nowNextGrid: document.getElementById("nowNextGrid"),
    streamingHero: document.getElementById("streamingHero"),
    streamPlatformPills: document.getElementById("streamPlatformPills"),
    streamTypePills: document.getElementById("streamTypePills"),
    streamGenrePills: document.getElementById("streamGenrePills"),
    streamWindowPills: document.getElementById("streamWindowPills"),
    streamSortSelect: document.getElementById("streamSortSelect"),
    streamCountLabel: document.getElementById("streamCountLabel"),
    streamingGrid: document.getElementById("streamingGrid"),
    globalSearch: document.getElementById("globalSearch"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    searchResultsSection: document.getElementById("searchResultsSection"),
    searchResultsGrid: document.getElementById("searchResultsGrid"),
    searchSummary: document.getElementById("searchSummary"),
    closeSearchResults: document.getElementById("closeSearchResults"),
    mainContent: document.getElementById("mainContent"),
    watchlistBtn: document.getElementById("watchlistBtn"),
    watchlistCount: document.getElementById("watchlistCount"),
    watchlistDrawer: document.getElementById("watchlistDrawer"),
    watchlistItems: document.getElementById("watchlistItems"),
    closeDrawerBtn: document.getElementById("closeDrawerBtn"),
    detailModal: document.getElementById("detailModal"),
    modalBody: document.getElementById("modalBody"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    helpGuideBtn: document.getElementById("helpGuideBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    themeIconSun: document.getElementById("themeIconSun"),
    themeIconMoon: document.getElementById("themeIconMoon"),
    themeIconSystem: document.getElementById("themeIconSystem"),
    liveRefreshBtn: document.getElementById("liveRefreshBtn"),
    liveStatusText: document.getElementById("liveStatusText"),
    feedsRefreshBtn: document.getElementById("feedsRefreshBtn"),
    feedSourcePills: document.getElementById("feedSourcePills"),
    unifiedFeedGrid: document.getElementById("unifiedFeedGrid"),
    wtwThisWeekGrid: document.getElementById("wtwThisWeekGrid"),
    wtwInterestedGrid: document.getElementById("wtwInterestedGrid"),
    interestPills: document.getElementById("interestPills"),
    clearInterestsBtn: document.getElementById("clearInterestsBtn"),
    settingsContainer: document.getElementById("settingsContainer"),
    onboardingModal: document.getElementById("onboardingModal"),
    onboardingBody: document.getElementById("onboardingBody"),
    toast: document.getElementById("toast")
  };

  // Helpers
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function getBroadcastStatus(prog) {
    if (!prog) return "";
    const title = prog.title || "";
    const desc = prog.desc || "";
    if (prog.isNew || /^New:\s*/i.test(title)) return "New";
    if (/^Live:\s*/i.test(title) || (prog.genre === "News" && !/\(R\)|\brepeat\b/i.test(desc))) return "";
    if (prog.isRepeat || /\(R\)|\brepeat\b/i.test(desc) || /\(R\)|\brepeat\b/i.test(title)) return "Repeat";
    return "";
  }

  // Radio Times-style "Pick of the Day / Critic's Choice" star index (What to Watch & What's New)
  let editorialStarCache = { sig: "", whatsNewSet: new Set(), wtwSet: new Set() };
  const EDITORIAL_FILLER_RE = /\b(bbc news|itv news|utv live|stv news|channel 4 news|5 news|sky news|weather|breakfast|good morning britain|lorraine|this morning|loose women|teleshopping|shop on tv|ideal world|qvc|nightscreen|this is bbc|cbbc|cbeebies|milkshake|bargain hunt|homes under the hammer|flog it|escape to the country|dickinson's real deal|tipping point|lingo|cash in the attic|doctor's orders)\b/i;
  const EDITORIAL_FLAGSHIP_SHOW_RE = /\b(the traitors|strictly come dancing|doctor who|blue lights|happy valley|line of duty|slow horses|great british bake off|taskmaster|gavin\s*&\s*stacey|i'm a celebrity|gladiators|race across the world|wolf hall|ludwig|sherwood|peaky blinders|black mirror|the gentlemen|rivals|the day of the jackal|drag race|masterchef|the apprentice|graham norton|late late toy show|match of the day|six nations|nations league|champions league|premier league|world cup|wimbledon|glastonbury|bafta|oscars|eurovision)\b/i;
  const EDITORIAL_FLAGSHIP_CH_RE = /^(bbc one|bbc two|bbc four|itv1|utv|stv|channel 4|film4|5\b|channel 5|rt[eé]\s*(one|two|1|2)|tg4|virgin media one|sky showcase|sky atlantic|sky cinema|sky sports main)/i;

  function normalizeEditorialTitle(raw = "") {
    return String(raw || "")
      .replace(/^(new|live|film|movie):\s*/i, "")
      .replace(/\s*\((uk|us|ireland|australia|nz|canada|celebrity|uncloaked|unpacked|\d{4}|r)\)\s*$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function getEditorialStarIndex() {
    const sig = `${liveStreamingItems.length}:${liveFeedItems.length}:${state.dayOffset}:${[...state.interests].join(",")}`;
    if (editorialStarCache.sig === sig) return editorialStarCache;

    const whatsNewSet = new Set();
    const wtwSet = new Set();

    // 1. What's New items (live streaming drops + RSS feed titles + new this week catalogue)
    liveStreamingItems.forEach((item) => {
      const k = normalizeEditorialTitle(item && item.title);
      if (k.length >= 3) whatsNewSet.add(k);
    });
    liveFeedItems.forEach((item) => {
      const raw = (item && (item.showTitle || item.title)) || "";
      const k = normalizeEditorialTitle(raw);
      if (k.length >= 3) whatsNewSet.add(k);
      // Extract quoted show titles from RSS headlines (e.g. 'The Traitors' or "Blue Lights")
      const quoted = String(raw).match(/['"“‘]([^'"”’]{3,45})['"”’]/g) || [];
      quoted.forEach((q) => {
        const qk = normalizeEditorialTitle(q.slice(1, -1));
        if (qk.length >= 4) whatsNewSet.add(qk);
      });
    });

    // 2. What to Watch items (curated STREAMING_CATALOGUE thisWeek / 4.5+ stars)
    if (Array.isArray(STREAMING_CATALOGUE)) {
      STREAMING_CATALOGUE.forEach((item) => {
        const k = normalizeEditorialTitle(item && item.title);
        if (!k) return;
        if (item.thisWeek) whatsNewSet.add(k);
        if (item.thisWeek || Number(item.rating || 0) >= 4.5) wtwSet.add(k);
      });
    }

    editorialStarCache = { sig, whatsNewSet, wtwSet };
    return editorialStarCache;
  }

  function getEditorialStarInfo(prog, ch = null) {
    if (!prog || !prog.title) return null;
    const title = String(prog.title || "");
    if (EDITORIAL_FILLER_RE.test(title) || prog.genre === "News") return null;

    const norm = normalizeEditorialTitle(title);
    if (!norm || norm.length < 3) return null;

    const { whatsNewSet, wtwSet } = getEditorialStarIndex();

    if (whatsNewSet.has(norm)) {
      return { starred: true, source: "whats-new", label: "What's New Highlight" };
    }
    if (wtwSet.has(norm) || prog.thisWeek) {
      return { starred: true, source: "what-to-watch", label: "What to Watch Pick" };
    }
    if (EDITORIAL_FLAGSHIP_SHOW_RE.test(title)) {
      return { starred: true, source: "what-to-watch", label: "Critic's Choice Pick" };
    }

    // Match user's personal What to Watch Interests
    if (state.interests && state.interests.size > 0 && Array.isArray(prog.interests)) {
      const matchedInterest = prog.interests.find((tag) => state.interests.has(tag));
      if (matchedInterest) {
        return { starred: true, source: "interest", label: `What to Watch • ${matchedInterest}` };
      }
    }

    // Primetime flagship Drama / Film / Premiere / Major Sport (Radio Times Pick of the Day criteria)
    const ratingVal = Number(prog.stars || prog.rating || 0);
    if (ratingVal >= 4.5) {
      return { starred: true, source: "what-to-watch", label: "Top Rated Pick" };
    }
    if (typeof prog.startMin === "number" && typeof prog.endMin === "number") {
      const dur = prog.endMin - prog.startMin;
      const isPrimetime = prog.startMin >= 19 * 60 + 30 && prog.startMin <= 22 * 60 + 15;
      const isFlagshipCh = ch && EDITORIAL_FLAGSHIP_CH_RE.test(ch.name || "");
      const isNewBroadcast = getBroadcastStatus(prog) === "New";
      if (isPrimetime && dur >= 45 && isFlagshipCh && (isNewBroadcast || prog.genre === "Drama" || prog.genre === "Film" || prog.genre === "Sport")) {
        return { starred: true, source: "what-to-watch", label: "What to Watch Primetime Pick" };
      }
    }
    return null;
  }

  function downloadReminderIcs(title, channelName, isoDate, startMin, endMin, desc = "") {
    const dt = isoDate || getSkyDateStrForOffset(0).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const [y, m, d] = dt.split("-").map(Number);
    const pad2 = (n) => String(n).padStart(2, "0");
    const sh = Math.floor(startMin / 60) % 24;
    const sm = startMin % 60;
    const eh = Math.floor(endMin / 60) % 24;
    const em = endMin % 60;
    const dtStart = `${y}${pad2(m)}${pad2(d)}T${pad2(sh)}${pad2(sm)}00`;
    const dtEnd = `${y}${pad2(m)}${pad2(d)}T${pad2(eh)}${pad2(em)}00`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//OnAir UK//TV Reminder//EN",
      "BEGIN:VEVENT",
      `UID:onair-${Date.now()}@analogbits.github.io`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${String(title).replace(/\n/g, " ")} (${channelName})`,
      `DESCRIPTION:${String(desc || "").replace(/\n/g, " ").slice(0, 240)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT10M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${String(title)} starts in 10 minutes on ${channelName}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dt}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function checkDueReminders() {
    if (!Array.isArray(state.reminderItems) || !state.reminderItems.length) return;
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let changed = false;
    const leadMins = Number(state.reminderLeadMins || 10);
    state.reminderItems.forEach((item) => {
      if (!item || item.alerted || item.isoDate !== todayIso) return;
      const diff = item.startMin - nowMin;
      if (diff >= -1 && diff <= leadMins) {
        item.alerted = true;
        changed = true;
        const msg = diff <= 0
          ? `${item.title} is starting now on ${item.channelName}`
          : `${item.title} starts in ${diff} min (${formatTime(item.startMin)}) on ${item.channelName}`;
        showToast(`🔔 ${msg}`);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("OnAir UK Reminder", { body: msg });
          } catch {
            // Ignore notification errors
          }
        }
      }
    });
    if (changed) {
      localStorage.setItem("onair_reminder_items", JSON.stringify(state.reminderItems));
    }
  }

  function formatTime(minutesFromMidnight) {
    const h = Math.floor(minutesFromMidnight / 60) % 24;
    const m = minutesFromMidnight % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function getNowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function formatStars(count) {
    if (!count) return "";
    return "★".repeat(count) + "☆".repeat(5 - count);
  }

  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
  }

  function channelSortValue(num, ch) {
    const s = String(num ?? "");
    if (/^0\d+/.test(s) || (ch && ch.category === "Radio")) return 10000 + Number(s);
    return Number(s) || 99999;
  }

  function getFilteredChannels(category) {
    const filtered = liveChannels.filter((ch) => {
      if (ch.numbers[state.platform] === null || ch.numbers[state.platform] === undefined) {
        return false;
      }
      if (category === "Favorites") return state.favorites.has(ch.id);
      if (category !== "All" && ch.category !== category) return false;
      return true;
    }).sort((a, b) => channelSortValue(a.numbers[state.platform], a) - channelSortValue(b.numbers[state.platform], b));

    // On Freeview/Virgin/BT/Freesat, deduplicate HD/SD variants sharing the same EPG number (prefer HD)
    if (state.platform === "sky") return filtered;
    const byNum = new Map();
    filtered.forEach((ch) => {
      const num = Number(ch.numbers[state.platform]);
      const existing = byNum.get(num);
      if (!existing || (!existing.hd && ch.hd)) {
        byNum.set(num, ch);
      }
    });
    return Array.from(byNum.values()).sort((a, b) => channelSortValue(a.numbers[state.platform], a) - channelSortValue(b.numbers[state.platform], b));
  }

  const SEASON_CALENDAR = [
    {
      id: "christmas",
      chip: "🎄 Christmas",
      windowLabel: "Nov 10 – Dec 31",
      title: "🎄 Christmas & Festive — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for November–December: festive films, specials & dedicated Christmas channels",
      regex: /\b(christmas|xmas|santa(\s+claus)?|father\s+christmas|elf|nativity|festive|scrooge|grinch|snowman|christmas\s+carol|carols|carol\s+(service|singing|concert)|mistletoe|miracle\s+on\s+34th|winter\s+wonderland|nutcracker|advent|pantomime|panto|jingle|reindeer|north\s+pole|home\s+alone|polar\s+express|yuletide|tinsel|stocking|holiday\s+(inn|special|romance|movie|film|heist|magic))\b/i,
      searchQuery: "christmas",
      matchesDate: (m, d) => (m === 11 && d >= 10) || m === 12
    },
    {
      id: "winter",
      chip: "❄️ Winter",
      windowLabel: "Jan 1 – Feb 10",
      title: "❄️ New Year & Winter — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for January–early February: winter specials, cosy dramas & cold-weather docs",
      regex: /\b(new\s+year|hogmanay|winter|snow(fall|storm|y)?|arctic|frozen|alpine|blizzard|skiing|ice\s+(age|rink|skating|hotel|road|breaker|world)|polar|antarctic|cosy)\b/i,
      searchQuery: "winter",
      matchesDate: (m, d) => m === 1 || (m === 2 && d <= 10)
    },
    {
      id: "valentines",
      chip: "💘 Romance",
      windowLabel: "Feb 11 – Feb 18",
      title: "💘 Valentine's & Romance — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for Valentine's week: romantic films, dramas & love stories",
      regex: /\b(valentine('?s)?|romance|romantic|love\s+story|falling\s+in\s+love|romcom|rom-com|romeo|juliet|cupid|soulmate|first\s+dates|married\s+at\s+first\s+sight|wedding)\b/i,
      searchQuery: "romance",
      matchesDate: (m, d) => m === 2 && d >= 11 && d <= 18
    },
    {
      id: "easter",
      chip: "🐣 Spring & Easter",
      windowLabel: "Feb 19 – Apr 30",
      title: "🐣 Spring & Easter — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for Spring: Easter family films, nature & gardening specials",
      regex: /\b(easter|springtime|spring\s+(watch|special|awakening|clean)|springwatch|passover|good\s+friday|bunny|chocolate\s+egg|blossom|lambing|daffodil|gardener'?s?\s+world)\b/i,
      searchQuery: "easter",
      matchesDate: (m, d) => (m === 2 && d >= 19) || m === 3 || m === 4
    },
    {
      id: "summer",
      chip: "☀️ Summer",
      windowLabel: "May 1 – Aug 31",
      title: "☀️ Summer & Festivals — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for Summer: live festivals, summer sport, travel & sunshine films",
      regex: /\b(summer|heatwave|glastonbury|wimbledon|proms|bbc\s+proms|festival|beach|sunshine|seaside|coastal|island|olympics?|eurovision|tour\s+de\s+france|ashes|cricket|bbq|barbecue)\b/i,
      searchQuery: "summer",
      matchesDate: (m) => m >= 5 && m <= 8
    },
    {
      id: "autumn",
      chip: "🍂 Autumn",
      windowLabel: "Sep 1 – Oct 15",
      title: "🍂 Autumn & Cosy Nights — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for Autumn: mystery dramas, bake-offs, nature & cosy evenings",
      regex: /\b(autumn|autumnwatch|harvest|bake\s+off|strictly\s+come\s+dancing|cosy|murder\s+mystery|whodunnit|agatha\s+christie|detective|bonfire)\b/i,
      searchQuery: "mystery",
      matchesDate: (m, d) => m === 9 || (m === 10 && d <= 15)
    },
    {
      id: "halloween",
      chip: "🎃 Halloween",
      windowLabel: "Oct 16 – Nov 9",
      title: "🎃 Halloween & Spooky — Live on UK TV & Free Streaming",
      subtitle: "Auto-updated for Spooky Season: horror, ghost stories, supernatural & thrillers",
      regex: /\b(halloween|spooky|horror|ghost(s|ly)?|haunted|witches|witchcraft|vampire|zombie|nightmare|terror|frankenstein|dracula|exorcist|paranormal|supernatural|occult|pumpkin|bonfire\s+night|guy\s+fawkes)\b/i,
      searchQuery: "halloween",
      matchesDate: (m, d) => (m === 10 && d >= 16) || (m === 11 && d < 10)
    }
  ];

  function getAutoSeason(date = new Date()) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return SEASON_CALENDAR.find((s) => s.matchesDate(m, d)) || SEASON_CALENDAR[5];
  }

  function getActiveSeason(date = new Date()) {
    if (state.seasonOverride && state.seasonOverride !== "auto") {
      const custom = SEASON_CALENDAR.find((s) => s.id === state.seasonOverride);
      if (custom) return { ...custom, isOverride: true };
    }
    return { ...getAutoSeason(date), isOverride: false };
  }

  function isSeasonalMode() {
    return state.guideMode === "seasonal";
  }

  function syncGuideModeUI() {
    const autoSeason = getAutoSeason();
    const season = getActiveSeason();
    const seasonal = isSeasonalMode();
    const selectedVal = seasonal ? (state.seasonOverride || "auto") : "normal";
    const optionsHtml = [
      `<option value="normal">📺 Normal Viewing</option>`,
      `<option value="auto">🔄 Auto (${escapeHtml(autoSeason.chip)})</option>`,
      ...SEASON_CALENDAR.map(
        (s) => `<option value="${s.id}">${escapeHtml(s.chip)} (${escapeHtml(s.windowLabel)})</option>`
      )
    ].join("");
    [document.getElementById("guideModeSelect"), document.getElementById("headerGuideModeSelect")].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = optionsHtml;
      sel.value = selectedVal;
      sel.style.borderColor = seasonal ? "var(--accent)" : "";
      sel.style.color = seasonal ? "var(--accent)" : "";
      sel.onchange = (e) => setGuideModeChoice(e.target.value);
    });
    if (!state.timeMachineDate && el.timeMachineBtnLabel) {
      el.timeMachineBtnLabel.textContent = seasonal ? `${season.chip.split(" ")[0]} Time Machine` : "Time Machine";
    }
  }

  function setGuideModeChoice(val) {
    if (val === "normal") {
      state.guideMode = "normal";
      localStorage.setItem("onair_guide_mode", "normal");
      if (state.epgCategory === "Seasonal") state.epgCategory = "All";
      if (state.nowNextCategory === "Seasonal") state.nowNextCategory = "All";
    } else {
      state.guideMode = "seasonal";
      state.seasonOverride = val || "auto";
      localStorage.setItem("onair_guide_mode", "seasonal");
      localStorage.setItem("onair_season_override", state.seasonOverride);
    }
    const season = getActiveSeason();
    renderCategoryPills();
    renderWhatToWatch();
    renderStreaming();
    if (el.tmPopover && !el.tmPopover.classList.contains("hidden") && el.timeMachineBtn) {
      el.timeMachineBtn.click();
      el.timeMachineBtn.click();
    }
    showToast(
      isSeasonalMode()
        ? `Guide mode: ${season.chip} (Time Machine, What to Watch & Streaming)`
        : "Guide mode: 📺 Normal Viewing"
    );
  }

  function progMatchesCategory(prog, category, chName = "") {
    if (!prog) return false;
    if (category === "Seasonal") {
      const season = getActiveSeason();
      return season.regex.test(`${prog.title || ""} ${prog.desc || ""} ${chName || ""}`);
    }
    if (prog.genre === category) return true;
    if (category === "Entertainment" && prog.genre === "Comedy") return true;
    if (category === "Film" && /^film:/i.test(prog.title || "")) return true;
    return false;
  }

  function filterChannelsByCurrentProgramme(platformChannels, category, dayOffset, nowMin) {
    if (category === "All" || category === "Favorites") {
      return getFilteredChannels(category);
    }
    if (category === "Radio") {
      return platformChannels.filter((ch) => ch.category === "Radio");
    }
    if (category === "Seasonal") {
      const season = getActiveSeason();
      return platformChannels.filter((ch) => {
        if (season.regex.test(ch.name || "")) return true;
        const progs = getSchedule(ch.id, dayOffset);
        if (!progs || !progs.length) return false;
        const current = progs.find((p) => nowMin >= p.startMin && nowMin < p.endMin) || progs[0];
        if (dayOffset === 0) return progMatchesCategory(current, "Seasonal", ch.name);
        return progs.some((p) => progMatchesCategory(p, "Seasonal", ch.name));
      });
    }
    return platformChannels.filter((ch) => {
      const progs = getSchedule(ch.id, dayOffset);
      if (progs === null) return ch.category === category;
      if (!progs.length) return ch.category === category;
      const current = progs.find((p) => nowMin >= p.startMin && nowMin < p.endMin) || progs[0];
      if (dayOffset === 0) {
        return progMatchesCategory(current, category, ch.name);
      }
      return progMatchesCategory(current, category, ch.name) || progs.some((p) => progMatchesCategory(p, category, ch.name));
    });
  }

  // ========================================================================
  // Theme Management
  // ========================================================================
  const systemDarkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function getEffectiveTheme() {
    if (state.theme === "system") {
      return systemDarkQuery && systemDarkQuery.matches ? "dark" : "light";
    }
    return state.theme;
  }

  function applyTheme() {
    const effective = getEffectiveTheme();
    document.documentElement.setAttribute("data-theme", effective);
    localStorage.setItem("onair_theme", state.theme);

    el.themeIconSun.classList.add("hidden");
    el.themeIconMoon.classList.add("hidden");
    if (el.themeIconSystem) el.themeIconSystem.classList.add("hidden");

    if (state.theme === "system" && el.themeIconSystem) {
      el.themeIconSystem.classList.remove("hidden");
      el.themeToggleBtn.title = `Theme: Match System (${effective === "dark" ? "Dark" : "Light"}) — click to switch`;
    } else if (state.theme === "dark") {
      el.themeIconMoon.classList.remove("hidden");
      el.themeToggleBtn.title = "Theme: Dark — click to switch";
    } else {
      el.themeIconSun.classList.remove("hidden");
      el.themeToggleBtn.title = "Theme: Light — click to switch";
    }
  }

  if (systemDarkQuery && systemDarkQuery.addEventListener) {
    systemDarkQuery.addEventListener("change", () => {
      if (state.theme === "system") applyTheme();
    });
  }

  // ========================================================================
  // Navigation & Platform Controls
  // ========================================================================
  function switchView(viewName) {
    state.view = viewName;
    el.navTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === viewName);
    });
    el.viewPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `view-${viewName}`);
    });
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    if (viewName === "epg") {
      renderEPG();
    } else if (viewName === "now-next") {
      renderNowNext();
    } else if (viewName === "what-to-watch") {
      renderWhatToWatch();
    } else if (viewName === "streaming") {
      renderStreaming();
    } else if (viewName === "live-feeds") {
      renderLiveFeeds();
    } else if (viewName === "settings") {
      renderSettings();
    }
  }

  function renderPlatformPills() {
    const html = PLATFORMS.map(
      (p) =>
        `<button class="pill-btn ${state.platform === p.id ? "is-active" : ""}" data-platform="${p.id}" type="button">${p.name}</button>`
    ).join("");
    el.platformPills.innerHTML = html;
    el.nowNextPlatformPills.innerHTML = html;

    const activePlatform = PLATFORMS.find((p) => p.id === state.platform);
    el.nowNextPlatformLabel.textContent = activePlatform ? activePlatform.name : "Freeview";
  }

  function renderCategoryPills() {
    const season = getActiveSeason();
    const cats = isSeasonalMode()
      ? [...CHANNEL_CATEGORIES.slice(0, 2), { id: "Seasonal", label: season.chip }, ...CHANNEL_CATEGORIES.slice(2)]
      : [...CHANNEL_CATEGORIES];
    syncGuideModeUI();
    el.epgCategoryPills.innerHTML = cats
      .map((item) => {
        const id = typeof item === "string" ? item : item.id;
        const label = typeof item === "string" ? (item === "Favorites" ? "★ Favorites" : item) : item.label;
        return `<button class="pill-btn ${state.epgCategory === id ? "is-active" : ""}" data-cat="${id}" type="button">${label}</button>`;
      })
      .join("");

    el.nowNextCategoryPills.innerHTML = cats
      .map((item) => {
        const id = typeof item === "string" ? item : item.id;
        const label = typeof item === "string" ? (item === "Favorites" ? "★ Favorites" : item) : item.label;
        return `<button class="pill-btn ${state.nowNextCategory === id ? "is-active" : ""}" data-nncat="${id}" type="button">${label}</button>`;
      })
      .join("");
  }

  function renderDateStrip() {
    const days = [];
    const formatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
    for (let i = -7; i <= 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const label = i === -1 ? "Yesterday" : i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatter.format(d);
      const pastClass = i < 0 ? "is-past-day" : "";
      days.push(
        `<button class="date-btn ${pastClass} ${!state.timeMachineDate && state.dayOffset === i ? "is-active" : ""}" data-day="${i}" type="button" role="tab">${label}</button>`
      );
    }
    el.dateStrip.innerHTML = days.join("");
    const activeBtn = el.dateStrip.querySelector(".date-btn.is-active");
    if (activeBtn && activeBtn.scrollIntoView) {
      activeBtn.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }

  // ========================================================================
  // EPG Grid Rendering
  // ========================================================================
  function renderEPG(triggerFetch = true) {
    const nowMin = getNowMinutes();
    const platformChannels = getFilteredChannels("All");
    if (triggerFetch) {
      const toFetch = state.epgCategory === "Favorites" ? getFilteredChannels("Favorites") : platformChannels;
      ensureSchedulesForChannels(toFetch, state.dayOffset);
    }
    let channels = filterChannelsByCurrentProgramme(platformChannels, state.epgCategory, state.dayOffset, nowMin);
    if (state.epgChannelQuery) {
      const cq = state.epgChannelQuery.toLowerCase().trim();
      channels = channels.filter((c) => {
        const num = c.numbers && c.numbers[state.platform] != null ? String(c.numbers[state.platform]).toLowerCase() : "";
        return (c.name && c.name.toLowerCase().includes(cq)) || (c.short && c.short.toLowerCase().includes(cq)) || num.includes(cq);
      });
    }
    if (state.timeMachineDate && timeMachineEpg) {
      channels = [...channels].sort((a, b) => {
        const aHas = (timeMachineEpg[a.sid] || []).length > 0 ? 1 : 0;
        const bHas = (timeMachineEpg[b.sid] || []).length > 0 ? 1 : 0;
        return bHas - aHas;
      });
    }
    PIXELS_PER_MIN = Number(state.epgZoom || 4);
    document.body.classList.toggle("hover-reveal-enabled", Boolean(state.hoverRevealNames));
    if (el.epgGrid) {
      el.epgGrid.classList.toggle("is-compact", state.epgDensity === "compact");
    }
    const totalMinutes = (END_HOUR - START_HOUR) * 60;
    const trackWidth = totalMinutes * PIXELS_PER_MIN;
    const tickWidth = 30 * PIXELS_PER_MIN;

    // Time Header
    let ticksHtml = "";
    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += 30) {
      const isHour = m % 60 === 0;
      ticksHtml += `<div class="epg-time-tick ${isHour ? "is-hour" : ""}" style="width:${tickWidth}px;">${formatTime(m)}</div>`;
    }

    let rowsHtml = "";
    if (channels.length === 0) {
      rowsHtml = `<div class="empty-state" style="padding: 60px 24px;">No channels match this filter on the selected platform.</div>`;
    } else {
      rowsHtml = channels
        .map((ch) => {
          const rawProgs = getSchedule(ch.id, state.dayOffset);
          const progs = Array.isArray(rawProgs) && state.hideTeleshopping
            ? rawProgs.filter((p) => !/\b(teleshopping|shop on tv|ideal world|qvc|paid programming|infomercial)\b/i.test(p.title || ""))
            : rawProgs;
          const isFav = state.favorites.has(ch.id);
          const chNum = ch.numbers[state.platform];

          let progsHtml = "";
          if (progs === null) {
            progsHtml = `<div style="padding:26px 20px; font-size:12px; color:var(--text-muted);">Fetching live schedule...</div>`;
          } else if (progs.length === 0) {
            progsHtml = state.timeMachineDate
              ? `<div style="padding:22px 20px; font-size:12px; color:var(--text-muted);">No archive data for ${escapeHtml(ch.name)} on ${escapeHtml(state.timeMachineDate)} &mdash; <a href="https://tv24.co.uk/tv/${escapeHtml(state.timeMachineDate)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:600; text-decoration:none;">View full day on tv24.co.uk &nearr;</a></div>`
              : `<div style="padding:26px 20px; font-size:12px; color:var(--text-muted);">No broadcast data published for this channel today.</div>`;
          } else {
            progsHtml = progs
              .map((p) => {
                const left = (p.startMin - START_HOUR * 60) * PIXELS_PER_MIN;
                const width = Math.max((p.endMin - p.startMin) * PIXELS_PER_MIN - 3, 40);
                const isToday = state.dayOffset === 0;
                const isLive = isToday && nowMin >= p.startMin && nowMin < p.endMin;
                const isPast = isToday && nowMin >= p.endMin;
                const starInfo = getEditorialStarInfo(p, ch);
                const starHtml = starInfo
                  ? `<span class="rt-pick-star" title="&#9733; ${escapeHtml(starInfo.label)}">&#9733;</span>`
                  : "";

                const hoverTitle = `${starInfo ? `★ ${starInfo.label} • ` : ""}${p.title} (${formatTime(p.startMin)}–${formatTime(p.endMin)} • ${p.genre})`;

                return `
                  <button
                    class="epg-prog ${isLive ? "is-live" : ""} ${isPast ? "is-past" : ""} ${starInfo ? "is-rt-pick" : ""}"
                    style="left:${left}px; width:${width}px; --prog-w:${width}px;"
                    data-genre="${p.genre}"
                    data-prog-id="${p.id}"
                    data-channel-id="${ch.id}"
                    title="${escapeHtml(hoverTitle)}"
                    type="button"
                  >
                    <div class="prog-top-row">
                      <span class="prog-title">${starHtml}${p.title}</span>
                      ${isLive ? `<span class="mini-tag live">LIVE</span>` : getBroadcastStatus(p) === "New" ? `<span class="mini-tag">NEW</span>` : getBroadcastStatus(p) === "Repeat" ? `<span class="mini-tag">R</span>` : ""}
                    </div>
                    <div class="prog-bottom-row">
                      <span class="prog-time">${formatTime(p.startMin)}–${formatTime(p.endMin)}</span>
                      <span>&bull; ${p.genre}</span>
                    </div>
                  </button>
                `;
              })
              .join("");
          }

          return `
            <div class="epg-row">
              <div class="epg-channel-cell">
                <span class="channel-num">${chNum}</span>
                <div class="channel-badge" style="background:${ch.color}">${ch.short}</div>
                <div class="channel-meta">
                  <div class="channel-name" title="${ch.name}">${ch.name}</div>
                  <div class="channel-hd">${ch.hd ? "HD" : "SD"} &bull; ${ch.catchup}</div>
                </div>
                <button
                  class="fav-star-btn ${isFav ? "is-fav" : ""}"
                  data-fav-channel="${ch.id}"
                  title="${isFav ? "Remove from Favorites" : "Add to Favorites"}"
                  type="button"
                >&#9733;</button>
              </div>
              <div class="epg-track" style="width:${trackWidth}px;">
                ${progsHtml}
              </div>
            </div>
          `;
        })
        .join("");
    }

    // Current time vertical line (only on Today)
    let nowLineHtml = "";
    if (state.dayOffset === 0 && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60) {
      const nowOffsetPx = (nowMin - START_HOUR * 60) * PIXELS_PER_MIN;
      nowLineHtml = `<div class="epg-now-line" style="left:calc(var(--epg-channel-col) + ${nowOffsetPx}px);"></div>`;
    }

    el.epgGrid.innerHTML = `
      <div class="epg-time-header">
        <div class="epg-corner-cell">Channel</div>
        <div class="epg-time-slots" style="width:${trackWidth}px;">${ticksHtml}</div>
      </div>
      ${rowsHtml}
      ${nowLineHtml}
    `;
  }

  function scrollEpgToHour(hourVal) {
    const targetMinutes = hourVal === "now" ? getNowMinutes() : Number(hourVal) * 60;
    const offsetMinutes = Math.max(0, targetMinutes - START_HOUR * 60 - 45);
    el.epgScrollContainer.scrollTo({
      left: offsetMinutes * PIXELS_PER_MIN,
      behavior: "smooth"
    });
  }

  // ========================================================================
  // Now & Next View
  // ========================================================================
  function renderNowNext(triggerFetch = true) {
    const nowMin = getNowMinutes();
    const nowDate = new Date();
    el.nowNextClock.textContent = nowDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    const platformChannels = getFilteredChannels("All");
    if (triggerFetch) {
      const toFetch = state.nowNextCategory === "Favorites" ? getFilteredChannels("Favorites") : platformChannels;
      ensureSchedulesForChannels(toFetch, 0);
    }
    const channels = filterChannelsByCurrentProgramme(platformChannels, state.nowNextCategory, 0, nowMin);
    if (channels.length === 0) {
      el.nowNextGrid.innerHTML = `<div class="empty-state">No programmes matching "${state.nowNextCategory}" are on right now.</div>`;
      return;
    }

    el.nowNextGrid.innerHTML = channels
      .map((ch) => {
        const progs = getSchedule(ch.id, 0);
        if (progs === null) {
          return `
            <article class="nn-card">
              <div class="nn-card-head">
                <span class="channel-num">${ch.numbers[state.platform]}</span>
                <div class="channel-badge" style="background:${ch.color}">${ch.short}</div>
                <div class="channel-meta">
                  <div class="channel-name">${ch.name}</div>
                  <div class="channel-hd">${ch.category} &bull; ${ch.catchup}</div>
                </div>
              </div>
              <div class="nn-slot"><div class="prog-bottom-row">Fetching live schedule...</div></div>
            </article>
          `;
        }
        const nowIdx = progs.findIndex((p) => nowMin >= p.startMin && nowMin < p.endMin);
        const current = nowIdx >= 0 ? progs[nowIdx] : progs[0];
        const next = nowIdx >= 0 && progs[nowIdx + 1] ? progs[nowIdx + 1] : null;
        const pct = current
          ? Math.min(100, Math.max(5, Math.round(((nowMin - current.startMin) / (current.endMin - current.startMin)) * 100)))
          : 0;

        const currentStar = current ? getEditorialStarInfo(current, ch) : null;
        const nextStar = next ? getEditorialStarInfo(next, ch) : null;

        return `
          <article class="nn-card">
            <div class="nn-card-head">
              <span class="channel-num">${ch.numbers[state.platform]}</span>
              <div class="channel-badge" style="background:${ch.color}">${ch.short}</div>
              <div class="channel-meta">
                <div class="channel-name">${ch.name}</div>
                <div class="channel-hd">${ch.category} &bull; ${ch.catchup}</div>
              </div>
            </div>

            ${
              current
                ? `<div class="nn-slot is-now" data-prog-id="${current.id}" data-channel-id="${ch.id}">
                    <div class="nn-slot-label">
                      <span>On Now ${currentStar ? `&bull; <span style="color:#f59e0b; font-weight:700;" title="${escapeHtml(currentStar.label)}">&#9733; ${escapeHtml(currentStar.label)}</span>` : ""} ${getLiveStreamUrl(ch) ? `&bull; <a href="${getLiveStreamUrl(ch)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:#dc2626; font-weight:700; text-decoration:none;">&#9654; Watch Live &nearr;</a>` : ""}</span>
                      <span>${formatTime(current.startMin)} – ${formatTime(current.endMin)}</span>
                    </div>
                    <div class="nn-slot-title">${currentStar ? `<span class="rt-pick-star" title="&#9733; ${escapeHtml(currentStar.label)}">&#9733;</span>` : ""}${current.title}</div>
                    <div class="prog-bottom-row">${current.ep} &bull; ${current.genre}</div>
                    <div class="nn-progress-bar"><div class="nn-progress-fill" style="width:${pct}%"></div></div>
                  </div>`
                : ""
            }

            ${
              next
                ? `<div class="nn-slot" data-prog-id="${next.id}" data-channel-id="${ch.id}">
                    <div class="nn-slot-label">
                      <span>Up Next ${nextStar ? `&bull; <span style="color:#f59e0b; font-weight:700;" title="${escapeHtml(nextStar.label)}">&#9733; Pick</span>` : ""}</span>
                      <span>${formatTime(next.startMin)} – ${formatTime(next.endMin)}</span>
                    </div>
                    <div class="nn-slot-title">${nextStar ? `<span class="rt-pick-star" title="&#9733; ${escapeHtml(nextStar.label)}">&#9733;</span>` : ""}${next.title}</div>
                    <div class="prog-bottom-row">${next.ep} &bull; ${next.genre}</div>
                  </div>`
                : ""
            }
          </article>
        `;
      })
      .join("");
  }

  // ========================================================================
  // What to Watch View (This Week + Tailored For You)
  // ========================================================================
  function collectTvHighlights() {
    const activeChannels = getFilteredChannels("All");
    const tvPicks = [];
    const seen = new Set();

    activeChannels.forEach((ch) => {
      const progs = getSchedule(ch.id, state.dayOffset);
      if (!progs) return;
      progs.forEach((p) => {
        if ((p.stars >= 4 || p.isNew || p.isLiveData || (p.interests && p.interests.length)) && !seen.has(p.title)) {
          seen.add(p.title);
          tvPicks.push({
            kind: "tv",
            prog: p,
            channel: ch,
            title: p.title,
            type: p.genre === "Film" ? "Films" : "TV",
            rating: p.stars || 4,
            interests: p.interests || [],
            thisWeek: Boolean(p.isNew || p.isLiveData || p.stars >= 5)
          });
        }
      });
    });
    return tvPicks;
  }

  function renderTvPickCard(item) {
    const { prog, channel } = item;
    const chNum = channel.numbers[state.platform];
    return `
      <article class="stream-card" data-prog-id="${prog.id}" data-channel-id="${channel.id}">
        <div class="stream-card-banner" style="background:${channel.color}"></div>
        <div class="stream-card-body">
          <div class="stream-card-top">
            <span class="platform-tag" style="background:${channel.color}">${channel.name}${chNum ? ` (${chNum})` : ""}</span>
            <span class="star-rating">${prog.stars ? formatStars(prog.stars) : `${formatTime(prog.startMin)}`}</span>
          </div>
          <h3 class="stream-card-title">${prog.title}</h3>
          <div class="stream-card-meta">${formatTime(prog.startMin)}–${formatTime(prog.endMin)} &bull; ${prog.genre} &bull; ${channel.catchup}</div>
          <p class="stream-card-desc">${prog.desc}</p>
          <div class="stream-card-footer">
            <span class="mini-tag ${prog.isLiveData ? "catchup" : ""}">${prog.isLiveData ? "Live TV" : prog.ep}</span>
            <span style="font-size:12px; font-weight:600; color:var(--brand-red);">Details &rarr;</span>
          </div>
        </div>
      </article>
    `;
  }

  const wtwAheadFetchingDays = new Set();

  function renderWatchAheadSection() {
    const container = document.getElementById("wtwWatchAhead");
    if (!container) return;

    const dayOffset = Math.max(0, Math.min(6, Number(state.wtwAheadDayOffset) || 0));
    const filter = state.wtwAheadFilter || "All";
    const platformChannels = liveChannels.filter(
      (c) => !c.plutoSlug && !c.tubiId && (c.numbers[state.platform] !== null || state.platform === "pluto" || state.platform === "tubi")
    );
    const topChannels = (platformChannels.length ? platformChannels : liveChannels.filter((c) => !c.plutoSlug && !c.tubiId)).slice(0, 36);

    const dayMap = liveEpgByDay.get(dayOffset) || {};
    const missingCount = topChannels.filter((c) => c.sid && !dayMap[c.sid]).length;
    if (missingCount > 0 && !wtwAheadFetchingDays.has(dayOffset)) {
      wtwAheadFetchingDays.add(dayOffset);
      ensureSchedulesForChannels(topChannels, dayOffset, false)
        .finally(() => wtwAheadFetchingDays.delete(dayOffset));
    }

    const dayPills = Array.from({ length: 7 }, (_, d) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      const lbl =
        d === 0
          ? "Today"
          : d === 1
          ? "Tomorrow"
          : dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      return `<button class="pill-btn ${dayOffset === d ? "is-active" : ""}" data-ahead-day="${d}" type="button">${lbl}</button>`;
    }).join("");

    const filterOptions = [
      { id: "All", label: "All Picks" },
      { id: "OnDemand", label: "📱 On Demand" },
      { id: "New", label: "✨ New & Premieres" },
      { id: "Film", label: "🎬 Films" },
      { id: "Drama", label: "🎭 Drama" },
      { id: "Sport", label: "⚽ Sport" },
      { id: "Documentary", label: "🌍 Docs" },
      { id: "Entertainment", label: "📺 Entertainment" }
    ];
    const filterPills = filterOptions
      .map((f) => `<button class="pill-btn ${filter === f.id ? "is-active" : ""}" data-ahead-filter="${f.id}" type="button">${f.label}</button>`)
      .join("");

    const nowMin = dayOffset === 0 ? getNowMinutes() : 0;
    const candidates = [];
    const seenTitles = new Set();
    const flagshipRe = /^(bbc one|bbc two|itv1|utv|stv|channel 4|5\b|rt[eé]|tg4|virgin one|bbc four|film4|sky showcase|sky atlantic|sky premiere|sky sports main)/i;
    const fillerRe = /\b(bbc news|itv news|channel 4 news|5 news|weather|breakfast|teleshopping|nightscreen|cbbc|cbeebies|milkshake|homes under the hammer|bargain hunt|cash in the attic)\b/i;

    topChannels.forEach((ch) => {
      const progs = dayMap[ch.sid] || [];
      progs.forEach((p) => {
        if (dayOffset === 0 && p.endMin <= nowMin) return;
        if (!p.title || fillerRe.test(p.title) || p.genre === "News" || p.genre === "Kids") return;
        const dur = p.endMin - p.startMin;
        if (dur < 25) return;

        if (filter === "New" && !p.isNew && !/^New:/i.test(p.title)) return;
        else if (filter !== "All" && filter !== "New" && p.genre !== filter) return;

        const tKey = p.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seenTitles.has(tKey)) return;
        seenTitles.add(tKey);

        let score = 0;
        if (p.isNew || /^New:/i.test(p.title)) score += 50;
        if (p.startMin >= 19 * 60 && p.startMin <= 22 * 60 + 45) score += 30;
        else if (p.startMin >= 17 * 60 && p.startMin < 19 * 60) score += 12;
        if (flagshipRe.test(ch.name)) score += 25;
        if (p.genre === "Film" || p.genre === "Drama" || p.genre === "Sport") score += 15;
        if (dur >= 55) score += 8;

        candidates.push({ prog: p, channel: ch, score });
      });
    });

    candidates.sort((a, b) => b.score - a.score || a.prog.startMin - b.prog.startMin);

    const pickedDate = new Date();
    pickedDate.setDate(pickedDate.getDate() + dayOffset);
    const pickedIso = `${pickedDate.getFullYear()}-${String(pickedDate.getMonth() + 1).padStart(2, "0")}-${String(pickedDate.getDate()).padStart(2, "0")}`;

    // On-Demand & Streaming picks for this day (exact-date drops + rotating UK streaming/catch-up picks)
    const catalogue = getMergedCatalogue();
    const odCandidates = [];
    catalogue.forEach((item, idx) => {
      if (!item || !item.title) return;
      const g = `${item.genre || ""} ${item.type || ""}`;
      if (filter === "New" && !item.thisWeek && !item.isNew && !(item.ep || "").includes(pickedIso)) return;
      else if (filter === "Film" && !/film|movie/i.test(g)) return;
      else if (filter !== "All" && filter !== "OnDemand" && filter !== "New" && filter !== "Film" && !new RegExp(filter, "i").test(g)) return;

      const tKey = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenTitles.has(tKey)) return;

      const isExactDate = (item.releaseDate === pickedIso) || (item.airdate === pickedIso) || String(item.ep || "").includes(pickedIso) || String(item.desc || "").includes(pickedIso);
      let odScore = (item.stars || 3.5) * 10;
      if (isExactDate) odScore += 65;
      if (item.thisWeek) odScore += 20;
      // Rotate non-exact-date catalogue across upcoming days so each day ahead feels fresh
      if (!isExactDate) odScore += ((idx + dayOffset * 7) % 13);
      odCandidates.push({ kind: "stream", item, score: odScore });
    });
    odCandidates.sort((a, b) => b.score - a.score);

    let combinedPicks = [];
    if (filter === "OnDemand") {
      combinedPicks = odCandidates.slice(0, 24);
    } else if (filter === "All") {
      const tvTop = candidates.slice(0, 16).map((c) => ({ kind: "tv", ...c }));
      const odTop = odCandidates.slice(0, 8);
      const maxLen = Math.max(tvTop.length, odTop.length);
      for (let i = 0; i < maxLen && combinedPicks.length < 24; i++) {
        if (tvTop[i]) combinedPicks.push(tvTop[i]);
        if (odTop[i] && combinedPicks.length < 24) combinedPicks.push(odTop[i]);
      }
    } else {
      const tvTop = candidates.slice(0, 18).map((c) => ({ kind: "tv", ...c }));
      const odTop = odCandidates.slice(0, 6);
      combinedPicks = [...tvTop, ...odTop].slice(0, 24);
    }

    const dayHeading =
      dayOffset === 0
        ? "Today's Pick of the Day"
        : dayOffset === 1
        ? "Tomorrow's Picks"
        : `Watch Ahead — ${pickedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`;

    const cardsHtml =
      combinedPicks.length > 0
        ? combinedPicks
            .map((entry) => (entry.kind === "stream" ? renderStreamCard(entry.item) : renderTvPickCard({ kind: "tv", prog: entry.prog, channel: entry.channel })))
            .join("")
        : `<div class="empty-state" style="grid-column:1/-1; padding:26px;">${
            missingCount > 0 && filter !== "OnDemand"
              ? `Loading ${escapeHtml(dayHeading)} schedules...`
              : `No matching picks found for this filter on ${escapeHtml(dayHeading)}. Try "All Picks".`
          }</div>`;

    container.innerHTML = `
      <div class="section-header-row" style="margin-bottom:10px;">
        <div>
          <h2 class="editorial-heading" style="font-size:24px;">📅 ${escapeHtml(dayHeading)}</h2>
          <p class="section-subtitle">Radio Times &amp; TV Times style daily picks across ${escapeHtml((ONAIR_LIVE.getRegion && ONAIR_LIVE.getRegion().short) || "UK")} TV &amp; On Demand</p>
        </div>
        <div class="filter-pills" style="flex-wrap:wrap;">${dayPills}</div>
      </div>
      <div class="filter-pills" style="margin-bottom:16px; flex-wrap:wrap;">${filterPills}</div>
      <div class="cards-grid">${cardsHtml}</div>
    `;

    container.querySelectorAll("[data-ahead-day]").forEach((btn) => {
      btn.onclick = () => {
        state.wtwAheadDayOffset = Number(btn.dataset.aheadDay);
        renderWatchAheadSection();
      };
    });
    container.querySelectorAll("[data-ahead-filter]").forEach((btn) => {
      btn.onclick = () => {
        state.wtwAheadFilter = btn.dataset.aheadFilter;
        renderWatchAheadSection();
      };
    });
    container.querySelectorAll("[data-prog-id]").forEach((card) => {
      card.onclick = () => {
        const ch = liveChannels.find((c) => c.id === card.dataset.channelId);
        const progs = (liveEpgByDay.get(dayOffset) || {})[ch && ch.sid] || [];
        const p = progs.find((ev) => String(ev.id) === String(card.dataset.progId));
        if (p && ch) openProgrammeModal(p, ch, dayOffset);
      };
    });
  }

  function renderWhatToWatch() {
    renderWatchAheadSection();
    const catalogue = getMergedCatalogue();
    const tvPicks = collectTvHighlights();

    // 0. Live Seasonal Spotlight (auto-updates by time of year, shown in Seasonal Mode)
    const seasonalEl = document.getElementById("wtwSeasonalSpotlight");
    if (seasonalEl && !isSeasonalMode()) {
      seasonalEl.innerHTML = "";
      seasonalEl.style.display = "none";
    } else if (seasonalEl) {
      seasonalEl.style.display = "";
      const season = getActiveSeason();
      const nowMin = getNowMinutes();
      const liveSeasonal = [];
      const seenSeasonal = new Set();
      liveChannels.forEach((ch) => {
        const progs = getSchedule(ch.id, 0) || [];
        progs.forEach((p) => {
          if (p.endMin <= nowMin) return;
          if (!season.regex.test(`${p.title || ""} ${p.desc || ""} ${ch.name || ""}`)) return;
          if (seenSeasonal.has(p.title)) return;
          seenSeasonal.add(p.title);
          liveSeasonal.push({ kind: "tv", prog: p, channel: ch, isOnNow: nowMin >= p.startMin && nowMin < p.endMin });
        });
      });
      liveSeasonal.sort((a, b) => Number(b.isOnNow) - Number(a.isOnNow) || a.prog.startMin - b.prog.startMin);

      const streamSeasonal = catalogue
        .filter((s) => season.regex.test(`${s.title || ""} ${s.desc || ""} ${s.genre || ""}`))
        .map((s) => ({ kind: "stream", item: s }));

      const autoSeason = getAutoSeason();
      const seasonBadge = season.isOverride
        ? `Previewing ${season.chip} (${season.windowLabel})`
        : `Auto · ${season.windowLabel}`;
      const seasonSwitchPills = [
        `<button class="chip-pill ${state.seasonOverride === "auto" ? "active" : ""}" data-season-pick="auto" type="button">🔄 Auto (${autoSeason.chip})</button>`,
        ...SEASON_CALENDAR.map(
          (s) => `<button class="chip-pill ${state.seasonOverride === s.id ? "active" : ""}" data-season-pick="${s.id}" type="button">${s.chip}</button>`
        )
      ].join("");

      const ukLive = liveSeasonal.filter((x) => !x.channel.plutoSlug && !x.channel.tubiId);
      const plutoLive = liveSeasonal.filter((x) => x.channel.plutoSlug);
      const tubiLive = liveSeasonal.filter((x) => x.channel.tubiId);

      let filteredLive = liveSeasonal;
      if (state.seasonalSourceFilter === "uk") filteredLive = ukLive;
      else if (state.seasonalSourceFilter === "pluto") filteredLive = plutoLive;
      else if (state.seasonalSourceFilter === "tubi") filteredLive = tubiLive;
      else {
        // Balanced mix across UK TV, Pluto TV, and Tubi
        const mixed = [];
        const maxLen = Math.max(ukLive.length, plutoLive.length, tubiLive.length);
        for (let i = 0; i < maxLen && mixed.length < 12; i++) {
          if (ukLive[i]) mixed.push(ukLive[i]);
          if (plutoLive[i] && mixed.length < 12) mixed.push(plutoLive[i]);
          if (tubiLive[i] && mixed.length < 12) mixed.push(tubiLive[i]);
        }
        filteredLive = mixed;
      }

      const seasonalCards =
        state.seasonalSourceFilter === "pluto" || state.seasonalSourceFilter === "tubi" || state.seasonalSourceFilter === "uk"
          ? filteredLive.slice(0, 12)
          : [...filteredLive.slice(0, 9), ...streamSeasonal.slice(0, 6)].slice(0, 12);

      const sourceFilterPills = [
        { id: "all", label: `All (${liveSeasonal.length})` },
        { id: "uk", label: `UK TV (${ukLive.length})` },
        { id: "pluto", label: `Pluto TV (${plutoLive.length})` },
        { id: "tubi", label: `Tubi (${tubiLive.length})` }
      ]
        .map(
          (f) => `<button class="chip-pill ${state.seasonalSourceFilter === f.id ? "active" : ""}" data-season-src="${f.id}" type="button">${f.label}</button>`
        )
        .join("");

      seasonalEl.innerHTML = `
        <div class="interest-picker-card" style="margin-bottom:28px;">
          <div class="section-header-row" style="margin-bottom:10px;">
            <div>
              <h2 class="editorial-heading" style="font-size:22px;">${season.title}</h2>
              <p class="section-subtitle">${season.subtitle} <span class="badge badge-now" style="margin-left:6px;">${seasonBadge}</span></p>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              ${sourceFilterPills}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;">
            ${seasonSwitchPills}
          </div>
          ${
            seasonalCards.length
              ? `<div class="cards-grid">${seasonalCards
                  .map((entry) => (entry.kind === "stream" ? renderStreamCard(entry.item) : renderTvPickCard(entry)))
                  .join("")}</div>`
              : `<div class="empty-state">No ${season.chip} programmes currently matched on ${state.seasonalSourceFilter === "pluto" ? "Pluto TV" : state.seasonalSourceFilter === "tubi" ? "Tubi" : "this source"} right now. <a href="${state.seasonalSourceFilter === "tubi" ? `https://tubitv.com/search/${encodeURIComponent(season.searchQuery)}` : `https://pluto.tv/gb_ie/search/?q=${encodeURIComponent(season.searchQuery)}`}" target="_blank" rel="noopener" style="color:var(--brand-red);font-weight:600;">Browse on-demand &nearr;</a></div>`
          }
        </div>
      `;
      seasonalEl.querySelectorAll("[data-season-src]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.seasonalSourceFilter = btn.dataset.seasonSrc || "all";
          renderWhatToWatch();
        });
      });
      seasonalEl.querySelectorAll("[data-season-pick]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.seasonOverride = btn.dataset.seasonPick || "auto";
          localStorage.setItem("onair_season_override", state.seasonOverride);
          renderCategoryPills();
          renderWhatToWatch();
          if (state.view === "epg") renderEPG(false);
        });
      });
    }

    // 1. What to Watch This Week
    let weekItems = [
      ...catalogue.filter((s) => s.thisWeek).map((s) => ({ kind: "stream", item: s, type: s.type === "Films" ? "Films" : "Streaming", rating: s.rating })),
      ...tvPicks.filter((t) => t.thisWeek)
    ];

    if (state.wtwWeekFilter === "TV") {
      weekItems = weekItems.filter((x) => x.kind === "tv");
    } else if (state.wtwWeekFilter === "Streaming") {
      weekItems = weekItems.filter((x) => x.kind === "stream" && x.type !== "Films");
    } else if (state.wtwWeekFilter === "Films") {
      weekItems = weekItems.filter((x) => x.type === "Films");
    }

    el.wtwThisWeekGrid.innerHTML =
      weekItems
        .slice(0, 12)
        .map((entry) => (entry.kind === "stream" ? renderStreamCard(entry.item) : renderTvPickCard(entry)))
        .join("") || `<div class="empty-state" style="grid-column:1/-1;">No highlights found for this filter.</div>`;

    // 2. Interest Pills
    el.interestPills.innerHTML = INTEREST_CATEGORIES.map(
      (cat) =>
        `<button class="pill-btn ${state.interests.has(cat) ? "interest-pill-selected" : ""}" data-interest="${cat}" type="button">${state.interests.has(cat) ? "✓ " : "+ "}${cat}</button>`
    ).join("");

    // 3. Tailored Recommendations across Live TV, Catch-Up & Streaming
    const selected = state.interests;
    if (selected.size === 0) {
      el.wtwInterestedGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Select one or more interests above to see tailored picks from Live TV, Catch-Up and Streaming.</div>`;
      return;
    }

    const CATCHUP_PLATFORMS = new Set(["BBC iPlayer", "ITVX", "Channel 4", "My5", "U", "discovery+"]);

    const matchedStream = catalogue
      .filter((s) => (s.interests || []).some((tag) => selected.has(tag)))
      .map((s) => ({
        kind: "stream",
        mode: CATCHUP_PLATFORMS.has(s.platform) ? "CatchUp" : "Streaming",
        stars: s.rating || 4,
        item: s,
        score: (s.interests || []).filter((t) => selected.has(t)).length * 10
      }));

    const matchedTv = tvPicks
      .filter((t) => (t.interests || []).some((tag) => selected.has(tag)))
      .map((t) => ({
        kind: "tv",
        mode: "Live",
        hasCatchup: CATCHUP_PLATFORMS.has(t.channel.catchup),
        stars: t.rating || 4,
        ...t,
        score: (t.interests || []).filter((tag) => selected.has(tag)).length * 10
      }));

    let combinedTailored = [...matchedStream, ...matchedTv];
    if (state.wtwModeFilter === "Live") {
      combinedTailored = combinedTailored.filter((x) => x.mode === "Live");
    } else if (state.wtwModeFilter === "CatchUp") {
      combinedTailored = combinedTailored.filter((x) => x.mode === "CatchUp" || x.hasCatchup);
    } else if (state.wtwModeFilter === "Streaming") {
      combinedTailored = combinedTailored.filter((x) => x.mode === "Streaming");
    }

    if (state.wtwMinStars > 0) {
      combinedTailored = combinedTailored.filter((x) => (x.stars || 0) >= state.wtwMinStars);
    }

    combinedTailored.sort((a, b) => b.score - a.score);

    el.wtwInterestedGrid.innerHTML =
      combinedTailored
        .slice(0, 36)
        .map((entry) => (entry.kind === "stream" ? renderStreamCard(entry.item) : renderTvPickCard(entry)))
        .join("") || `<div class="empty-state" style="grid-column:1/-1;">No matches yet for the selected interests, format and rating.</div>`;
  }

  // ========================================================================
  // Streaming & On-Demand Finder View
  // ========================================================================
  function renderStreamingFilters() {
    const platforms = ["All", "Netflix", "BBC iPlayer", "ITVX", "Channel 4", "Prime Video", "Disney+", "Apple TV+", "Sky / NOW", "Paramount+", "Pluto TV", "Tubi", "MUBI", "BFI Player"];
    const types = ["All", "TV Series", "Films", "Documentaries", "Sport"];
    const genres = ["All", "Drama", "Thriller", "Comedy", "Sci-Fi", "Documentary", "Sport"];
    const windows = ["All", "This Week", "Earlier This Month"];

    el.streamPlatformPills.innerHTML = platforms
      .map((p) => `<button class="pill-btn ${state.streamPlatform === p ? "is-active" : ""}" data-sp="${p}" type="button">${p}</button>`)
      .join("");
    el.streamTypePills.innerHTML = types
      .map((t) => `<button class="pill-btn ${state.streamType === t ? "is-active" : ""}" data-st="${t}" type="button">${t}</button>`)
      .join("");
    el.streamGenrePills.innerHTML = genres
      .map((g) => `<button class="pill-btn ${state.streamGenre === g ? "is-active" : ""}" data-sg="${g}" type="button">${g}</button>`)
      .join("");
    el.streamWindowPills.innerHTML = windows
      .map((w) => `<button class="pill-btn ${state.streamWindow === w ? "is-active" : ""}" data-swin="${w}" type="button">${w}</button>`)
      .join("");
  }

  let weeklyPickIndex = 0;
  let weeklyPickTimer = null;
  let weeklyPickPaused = false;

  function getWeeklyEditorsPicks(catalogue, count = 10) {
    if (!Array.isArray(catalogue) || !catalogue.length) return [];
    const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const tvTitles = new Set(
      (collectTvHighlights() || [])
        .map((h) => String((h.prog && h.prog.title) || "").toLowerCase().trim())
        .filter(Boolean)
    );
    const whatsNewText = (Array.isArray(liveFeedItems) ? liveFeedItems : [])
      .map((f) => `${f.title || ""} ${f.description || ""}`.toLowerCase())
      .join(" \n ");
    const season = typeof getActiveSeason === "function" && isSeasonalMode() ? getActiveSeason() : null;
    const highRated = catalogue.filter((item) => (Number(item.rating) || 0) >= 4);
    const sourceList = highRated.length >= count ? highRated : catalogue;
    const scored = sourceList
      .map((item) => {
        const rating = Number(item.rating) || 3.5;
        const cleanTitle = String(item.title || "").toLowerCase().trim();
        let score = rating * 30;
        if (item.isLiveData) score += 18;
        if (item.thisWeek) score += 15;
        if (tvTitles.has(cleanTitle)) score += 12;
        if (cleanTitle.length >= 4 && whatsNewText.includes(cleanTitle)) score += 20;
        if (season && season.regex && season.regex.test(`${item.title || ""} ${item.desc || ""} ${item.genre || ""}`)) {
          score += 65;
        }
        return { item, score };
      })
      .sort((a, b) => b.score - a.score || (Number(b.item.rating) || 0) - (Number(a.item.rating) || 0) || (Number(b.item.year) || 0) - (Number(a.item.year) || 0));

    const rotateSlice = (arr, poolSize, take) => {
      if (!arr.length) return [];
      const p = arr.slice(0, Math.min(poolSize, arr.length)).map((x) => x.item);
      const off = weekIndex % p.length;
      const rot = [...p.slice(off), ...p.slice(0, off)];
      return rot.slice(0, Math.min(take, rot.length));
    };

    const fiveStars = scored.filter((x) => (Number(x.item.rating) || 0) >= 4.8);
    const fourStars = scored.filter((x) => {
      const r = Number(x.item.rating) || 0;
      return r >= 4 && r < 4.8;
    });

    const fivePick = rotateSlice(fiveStars, 15, Math.ceil(count / 2));
    const fourPick = rotateSlice(fourStars, 15, Math.floor(count / 2));
    const mixed = [];
    const maxLen = Math.max(fivePick.length, fourPick.length);
    for (let i = 0; i < maxLen && mixed.length < count; i++) {
      if (fivePick[i]) mixed.push(fivePick[i]);
      if (fourPick[i] && mixed.length < count) mixed.push(fourPick[i]);
    }
    if (mixed.length < count) {
      const seen = new Set(mixed.map((m) => m.id));
      for (const x of scored) {
        if (!seen.has(x.item.id)) {
          mixed.push(x.item);
          seen.add(x.item.id);
          if (mixed.length >= count) break;
        }
      }
    }
    return mixed;
  }

  function renderStreamingHeroSlide(picks) {
    if (!el.streamingHero || !picks.length) return;
    const idx = ((weeklyPickIndex % picks.length) + picks.length) % picks.length;
    weeklyPickIndex = idx;
    const featured = picks[idx];
    const dotsHtml = picks
      .map(
        (p, i) =>
          `<button type="button" data-hero-dot="${i}" aria-label="Show ${i + 1}: ${escapeHtml(p.title)}" style="width:${i === idx ? "18px" : "7px"}; height:7px; border-radius:999px; border:0; cursor:pointer; padding:0; background:${i === idx ? "#fff" : "rgba(255,255,255,0.38)"}; transition:all 0.2s;"></button>`
      )
      .join("");

    el.streamingHero.innerHTML = `
      <div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
          <span class="hero-kicker" style="margin-bottom:0;">OnAir UK Weekly Pick (${idx + 1}/${picks.length}) &bull; ${escapeHtml(featured.platform)}</span>
          <div style="display:inline-flex; gap:4px; align-items:center;">
            <button type="button" data-hero-nav="-1" aria-label="Previous weekly pick" style="background:rgba(255,255,255,0.14); color:#fff; border:1px solid rgba(255,255,255,0.25); border-radius:999px; width:24px; height:24px; cursor:pointer; font-size:14px; line-height:1;">&#8249;</button>
            <button type="button" data-hero-nav="1" aria-label="Next weekly pick" style="background:rgba(255,255,255,0.14); color:#fff; border:1px solid rgba(255,255,255,0.25); border-radius:999px; width:24px; height:24px; cursor:pointer; font-size:14px; line-height:1;">&#8250;</button>
          </div>
        </div>
        <h1 class="hero-title">${escapeHtml(featured.title)}</h1>
        <p class="hero-desc">${escapeHtml(featured.desc)}</p>
        <div class="hero-actions" style="flex-wrap:wrap;">
          <button class="btn-primary" data-stream-id="${featured.id}" type="button">Read Review &amp; Details</button>
          <button class="ghost-btn" data-toggle-wl-stream="${featured.id}" type="button">
            ${isInWatchlist(featured.id) ? "✓ In Watchlist" : "+ Add to Watchlist"}
          </button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:14px;">
          ${dotsHtml}
        </div>
      </div>
      <div class="hero-meta-box">
        <div class="info-label" style="color:rgba(255,255,255,0.7)">Critic Rating</div>
        <div style="font-size:20px; color:#fbbf24; margin-bottom:8px;">${formatStars(featured.rating)}</div>
        <div style="font-size:13px; color:rgba(255,255,255,0.9);">
          <strong>${escapeHtml(featured.type)}</strong> &bull; ${escapeHtml(featured.seasons)}<br />
          Genre: ${escapeHtml(featured.genre)} &bull; Age ${escapeHtml(String(featured.age || "15"))}
        </div>
      </div>
    `;

    el.streamingHero.querySelectorAll("[data-hero-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        weeklyPickIndex = (weeklyPickIndex + Number(btn.dataset.heroNav) + picks.length) % picks.length;
        renderStreamingHeroSlide(picks);
      });
    });
    el.streamingHero.querySelectorAll("[data-hero-dot]").forEach((dot) => {
      dot.addEventListener("click", () => {
        weeklyPickIndex = Number(dot.dataset.heroDot);
        renderStreamingHeroSlide(picks);
      });
    });
  }

  function renderStreaming() {
    renderStreamingFilters();

    if ((!livePlutoFetchedDays.has(0) || !liveTubiFetchedDays.has(0)) && typeof ONAIR_LIVE !== "undefined") {
      if (!livePlutoFetchedDays.has(0) && ONAIR_LIVE.fetchPlutoTvData) {
        livePlutoFetchedDays.add(0);
        ONAIR_LIVE.fetchPlutoTvData(0, false).then((pluto) => {
          if (pluto && pluto.channels && pluto.channels.length) {
            const currentMap = liveEpgByDay.get(0) || {};
            pluto.channels.forEach((c) => {
              const evs = pluto.schedules[c.id] || pluto.schedules[c.sid] || [];
              currentMap[c.id] = evs;
              if (c.sid) currentMap[c.sid] = evs;
            });
            liveEpgByDay.set(0, currentMap);
            if (state.view === "streaming") renderStreaming();
            else if (state.view === "what-to-watch") renderWhatToWatch();
          }
        }).catch(() => {});
      }
      if (!liveTubiFetchedDays.has(0) && ONAIR_LIVE.fetchTubiLiveData) {
        liveTubiFetchedDays.add(0);
        ONAIR_LIVE.fetchTubiLiveData(0, false).then((tubi) => {
          if (tubi && tubi.channels && tubi.channels.length) {
            const currentMap = liveEpgByDay.get(0) || {};
            tubi.channels.forEach((c) => {
              const evs = tubi.schedules[c.id] || tubi.schedules[c.sid] || [];
              currentMap[c.id] = evs;
              if (c.sid) currentMap[c.sid] = evs;
            });
            liveEpgByDay.set(0, currentMap);
            if (state.view === "streaming") renderStreaming();
            else if (state.view === "what-to-watch") renderWhatToWatch();
          }
        }).catch(() => {});
      }
    }

    const catalogue = getMergedCatalogue();
    const weeklyPicks = getWeeklyEditorsPicks(catalogue, 10);
    if (weeklyPicks.length) {
      renderStreamingHeroSlide(weeklyPicks);
      if (weeklyPickTimer) clearInterval(weeklyPickTimer);
      weeklyPickTimer = setInterval(() => {
        if (weeklyPickPaused) return;
        const streamingSec = document.getElementById("view-streaming");
        if (streamingSec && !streamingSec.classList.contains("is-active")) return;
        weeklyPickIndex = (weeklyPickIndex + 1) % weeklyPicks.length;
        renderStreamingHeroSlide(weeklyPicks);
      }, 8000);
      if (!el.streamingHero.dataset.hoverBound) {
        el.streamingHero.dataset.hoverBound = "1";
        el.streamingHero.addEventListener("mouseenter", () => { weeklyPickPaused = true; });
        el.streamingHero.addEventListener("mouseleave", () => { weeklyPickPaused = false; });
      }
    }

    let items = catalogue.filter((item) => {
      if (state.streamPlatform !== "All" && item.platform !== state.streamPlatform) return false;
      if (state.streamType !== "All" && item.type !== state.streamType) return false;
      if (state.streamGenre !== "All" && item.genre !== state.streamGenre) return false;
      if (state.streamWindow === "This Week" && !item.thisWeek) return false;
      if (state.streamWindow === "Earlier This Month" && item.thisWeek) return false;
      if (state.streamWindow === "Earlier This Month" && item.releaseWindow !== "Last 30 Days" && !item.isLiveData) return false;
      return true;
    });

    if (state.streamSort === "rating") {
      const season = isSeasonalMode() ? getActiveSeason() : null;
      const isSeasonMatch = (it) => (season && season.regex ? Number(season.regex.test(`${it.title || ""} ${it.desc || ""} ${it.genre || ""}`)) : 0);
      items.sort((a, b) => isSeasonMatch(b) - isSeasonMatch(a) || b.rating - a.rating || b.year - a.year);
    } else if (state.streamSort === "year") {
      items.sort((a, b) => b.year - a.year);
    } else if (state.streamSort === "title") {
      items.sort((a, b) => a.title.localeCompare(b.title));
    }

    el.streamCountLabel.textContent = items.length;

    if (items.length === 0) {
      el.streamingGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No streaming titles match those filters. Try resetting a filter above.</div>`;
      return;
    }

    el.streamingGrid.innerHTML = items.map(renderStreamCard).join("");
  }

  function renderStreamCard(item) {
    const saved = isInWatchlist(item.id);
    const starInfo = getEditorialStarInfo(item, null);
    const season = isSeasonalMode() ? getActiveSeason() : null;
    const seasonalMatch = !!(season && season.regex && season.regex.test(`${item.title || ""} ${item.desc || ""} ${item.genre || ""}`));
    const seasonalBadge = seasonalMatch
      ? `<span class="mini-tag" style="background:rgba(217,45,32,0.12); color:var(--brand-red); border-color:rgba(217,45,32,0.28); font-weight:700;">${escapeHtml(season.chip)} Pick</span>`
      : "";
    const rtBadge = starInfo
      ? `<span class="mini-tag rt-pick" title="${escapeHtml(starInfo.label)}">&#9733; ${escapeHtml(starInfo.label)}</span>`
      : "";
    const nextBadge = item.nextEpisode && item.nextEpisode.airdate
      ? `<div style="margin-top:6px; font-size:11.5px; font-weight:700; color:var(--accent);">📅 Upcoming: ${escapeHtml(item.nextEpisode.airdate)}${item.nextEpisode.airtime ? ` · ${escapeHtml(item.nextEpisode.airtime)}` : ""}</div>`
      : "";
    const tmJumpBtn = item.nextEpisode && item.nextEpisode.airdate
      ? `<button class="pill-btn" data-tm-jump-iso="${escapeHtml(item.nextEpisode.airdate)}" type="button">🕰️ Time Machine</button>`
      : "";
    return `
      <article class="stream-card" data-stream-id="${item.id}">
        <div class="stream-card-banner" style="background:${item.platformColor}"></div>
        <div class="stream-card-body">
          <div class="stream-card-top">
            <span class="platform-tag" style="background:${item.platformColor}">${item.platform}</span>
            <span class="star-rating" title="${item.rating} out of 5">${formatStars(item.rating)}</span>
          </div>
          <h3 class="stream-card-title">${starInfo ? `<span class="rt-pick-star" title="&#9733; ${escapeHtml(starInfo.label)}">&#9733;</span>` : ""}${item.title}</h3>
          <div class="stream-card-meta">${item.type} &bull; ${item.genre} &bull; ${item.seasons} &bull; ${item.year}</div>
          ${nextBadge}
          <p class="stream-card-desc">${item.desc}</p>
          <div class="stream-card-footer">
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              <span class="mini-tag">Cert ${item.age}</span>
              ${rtBadge}
              ${seasonalBadge}
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${tmJumpBtn}
              <button class="pill-btn ${saved ? "is-active" : ""}" data-toggle-wl-stream="${item.id}" type="button">
                ${saved ? "✓ Saved" : "+ Watchlist"}
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  // ========================================================================
  // Global Search (Ahead & Back -7..+6 days + When On Next)
  // ========================================================================
  function getDayLabelShort(dayOffset) {
    if (dayOffset === 0) return "Today";
    if (dayOffset === 1) return "Tomorrow";
    if (dayOffset === -1) return "Yesterday";
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }

  function getSkyDateStrForOffset(dayOffset) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  function getCachedStoreForSearch() {
    try {
      if (typeof ONAIR_LIVE !== "undefined" && ONAIR_LIVE.getCachedStore) {
        return ONAIR_LIVE.getCachedStore() || {};
      }
      return JSON.parse(localStorage.getItem("onair_live_epg_v7") || "{}");
    } catch {
      return {};
    }
  }

  function getDayScheduleForSearch(ch, dayOffset, localCache) {
    const liveDay = liveEpgByDay.get(dayOffset);
    if (liveDay) {
      const liveEvs = liveDay[ch.sid] || liveDay[ch.id];
      if (Array.isArray(liveEvs) && liveEvs.length) return liveEvs;
    }
    const dateStr = getSkyDateStrForOffset(dayOffset);
    const epgDay = localCache && localCache[`epg_${dateStr}`];
    if (epgDay && epgDay[ch.sid] && Array.isArray(epgDay[ch.sid].events) && epgDay[ch.sid].events.length) {
      return epgDay[ch.sid].events;
    }
    const plutoBucket = localCache && (localCache[`pluto_v2_${dateStr}`] || localCache[`pluto_${dateStr}`]);
    if (ch.plutoSlug && plutoBucket && plutoBucket.schedules) {
      const ps = plutoBucket.schedules[ch.id] || plutoBucket.schedules[ch.sid];
      if (Array.isArray(ps) && ps.length) return ps;
    }
    const tubiBucket = localCache && (localCache[`tubi_v2_${dateStr}`] || localCache[`tubi_${dateStr}`]);
    if (ch.tubiId && tubiBucket && tubiBucket.schedules) {
      const ts = tubiBucket.schedules[ch.id] || tubiBucket.schedules[ch.sid];
      if (Array.isArray(ts) && ts.length) return ts;
    }
    if (dayOffset < 0 && typeof window !== "undefined" && window.ONAIR_PAST_EPG && window.ONAIR_PAST_EPG[dateStr]) {
      const pastMap = window.ONAIR_PAST_EPG[dateStr];
      const rawPast = pastMap[ch.id] || pastMap[ch.sid];
      if (Array.isArray(rawPast) && rawPast.length) {
        const dayMidnight = new Date();
        dayMidnight.setHours(0, 0, 0, 0);
        dayMidnight.setDate(dayMidnight.getDate() + dayOffset);
        const midnightSec = Math.floor(dayMidnight.getTime() / 1000);
        return rawPast
          .map((ev, idx) => {
            if (ev.title && ev.startMin != null) return ev;
            const startMin = Math.max(0, Math.floor(((ev.st || 0) - midnightSec) / 60));
            const endMin = Math.min(24 * 60, startMin + Number(ev.d || 30));
            if (endMin <= startMin) return null;
            return {
              id: `past-${ch.id}-${dateStr}-${idx}`,
              title: ev.t || "Untitled",
              desc: ev.s2 || "",
              genre: ch.category || "Entertainment",
              startMin,
              endMin
            };
          })
          .filter(Boolean);
      }
    }
    return null;
  }

  function scoreTextMatch(title, hay, q, tokens) {
    const t = (title || "").toLowerCase();
    const h = (hay || "").toLowerCase();
    if (!q || !tokens.length) return 0;
    if (!tokens.every((tok) => h.includes(tok))) return 0;
    if (t === q) return 100;
    if (t.startsWith(q)) return 85;
    if (t.includes(q)) return 70;
    if (tokens.every((tok) => t.includes(tok))) return 55;
    if (h.includes(q)) return 40;
    return 25;
  }

  function searchAcrossDays(query, platformOnly = state.searchPlatformOnly) {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    const activeTokens = tokens.length ? tokens : [q];
    const nowMin = getNowMinutes();
    const localCache = getCachedStoreForSearch();

    const streamMatches = getMergedCatalogue()
      .map((s) => {
        const hay = `${s.title} ${s.desc} ${s.platform} ${s.genre} ${s.cast}`;
        const score = scoreTextMatch(s.title, hay, q, activeTokens);
        return score > 0 ? { item: s, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    const platformChannels = getFilteredChannels("All");
    const orderedChannels = platformOnly
      ? platformChannels
      : [...platformChannels, ...liveChannels.filter((c) => c.numbers[state.platform] == null)];

    const channelMatches = orderedChannels
      .map((ch) => {
        const hay = `${ch.name} ${ch.short || ""} ${ch.category || ""} ${ch.catchup || ""}`;
        const score = scoreTextMatch(ch.name, hay, q, activeTokens);
        return score > 0 ? { channel: ch, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.channel);

    const tvMatches = [];
    const seenTv = new Set();

    for (let dayOffset = -7; dayOffset <= 6; dayOffset++) {
      orderedChannels.forEach((ch) => {
        const progs = getDayScheduleForSearch(ch, dayOffset, localCache);
        if (!progs) return;
        progs.forEach((p) => {
          const hay = `${p.title || ""} ${p.desc || ""} ${p.genre || ""} ${p.cast || ""} ${ch.name || ""}`;
          const score = scoreTextMatch(p.title, hay, q, activeTokens);
          if (score <= 0) return;
          const dedupKey = `${ch.id}-${dayOffset}-${p.startMin}-${p.title}`;
          if (seenTv.has(dedupKey)) return;
          seenTv.add(dedupKey);

          let status = "past";
          if (dayOffset === 0 && nowMin >= p.startMin && nowMin < p.endMin) status = "live";
          else if (dayOffset > 0 || (dayOffset === 0 && p.startMin > nowMin)) status = "upcoming";

          const dayLabel = getDayLabelShort(dayOffset);
          const whenLabel =
            status === "live"
              ? `🔴 LIVE NOW · ${formatTime(p.startMin)}–${formatTime(p.endMin)}`
              : status === "upcoming"
                ? `⏭️ On Next: ${dayLabel} ${formatTime(p.startMin)}`
                : `⏮️ Aired: ${dayLabel} ${formatTime(p.startMin)}`;

          tvMatches.push({ prog: p, channel: ch, dayOffset, status, whenLabel, score });
        });
      });
    }

    const statusRank = { live: 0, upcoming: 1, past: 2 };
    tvMatches.sort((a, b) => {
      if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
      if (b.score !== a.score && Math.abs(b.score - a.score) >= 20) return b.score - a.score;
      if (a.status === "past") return b.dayOffset - a.dayOffset || b.prog.startMin - a.prog.startMin;
      return a.dayOffset - b.dayOffset || a.prog.startMin - b.prog.startMin;
    });

    return { tvMatches, streamMatches, channelMatches };
  }

  const tvmazeSearchCache = new Map();

  async function fetchLiveShowDirectoryMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    if (tvmazeSearchCache.has(q)) return tvmazeSearchCache.get(q);

    // 1. Check local Show Vault first (0 network calls)
    const results = [];
    const vaultShows = (typeof window !== "undefined" && window.ONAIR_SHOW_VAULT && window.ONAIR_SHOW_VAULT.shows) || {};
    Object.values(vaultShows).forEach((s) => {
      if (!s || !s.title) return;
      if (`${s.title} ${s.desc || ""} ${s.genre || ""}`.toLowerCase().includes(q)) {
        results.push({
          id: `vault-${s.title}`,
          title: s.title,
          platform: s.watchPlatform || "UK TV / Streaming",
          type: "Series",
          genre: s.genre || "Entertainment",
          year: s.year || "",
          seasons: s.ep || "",
          rating: s.stars || 4.0,
          cast: s.cast || "",
          desc: s.desc || "",
          watchUrl: s.watchUrl || ""
        });
      }
    });

    // 2. Query TVMaze public CORS-enabled show search API if needed
    if (results.length < 3) {
      try {
        const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const list = await res.json();
          const topShows = Array.isArray(list) ? list.slice(0, 6) : [];
          const nextEpMap = {};
          await Promise.all(
            topShows.slice(0, 2).map(async (entry) => {
              const epHref = entry && entry.show && entry.show._links && entry.show._links.nextepisode && entry.show._links.nextepisode.href;
              if (!epHref) return;
              try {
                const epRes = await fetch(epHref);
                if (epRes.ok) nextEpMap[entry.show.id] = await epRes.json();
              } catch {
                // Ignore
              }
            })
          );
          topShows.forEach((entry) => {
            const show = entry && entry.show;
            if (!show || !show.name) return;
            if (results.some((r) => r.title.toLowerCase() === show.name.toLowerCase())) return;
            const net = (show.network && show.network.name) || (show.webChannel && show.webChannel.name) || "Streaming / On Demand";
            const cleanSummary = (show.summary || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const nextEp = nextEpMap[show.id] || null;
            results.push({
              id: `tvmaze-${show.id}`,
              title: show.name,
              platform: net,
              platformColor: "#334155",
              type: show.type || "Series",
              genre: (show.genres && show.genres[0]) || "Entertainment",
              year: (show.premiered || "").slice(0, 4) || "",
              seasons: show.status || "",
              age: "15",
              rating: show.rating && show.rating.average ? Number((show.rating.average / 2).toFixed(1)) : 4.2,
              cast: (show.genres || []).join(", ") || "Series",
              desc: cleanSummary || `${show.name} (${net}). Click Details to open direct UK on-demand links (Netflix, Channel 4, iPlayer, Prime Video).`,
              image: (show.image && (show.image.medium || show.image.original)) || "",
              officialSite: show.officialSite || show.url || "",
              nextEpisode: nextEp && nextEp.airdate ? { airdate: nextEp.airdate, airtime: nextEp.airtime || "", name: nextEp.name || "", season: nextEp.season, number: nextEp.number } : null,
              isLiveData: true
            });
          });
        }
      } catch {
        // Ignore offline/network error
      }
    }

    const final = results.slice(0, 16);
    final.forEach((item) => {
      if (!liveStreamingItems.some((x) => x.id === item.id)) {
        liveStreamingItems.push(item);
      }
    });
    tvmazeSearchCache.set(q, final);
    return final;
  }

  function jumpToGuideMatch(channelId, dayOffset, startMin) {
    const ch = liveChannels.find((c) => c.id === channelId);
    if (ch && ch.numbers[state.platform] == null) {
      const avail = PLATFORMS.find((p) => ch.numbers[p.id] != null);
      if (avail) state.platform = avail.id;
    }
    state.dayOffset = dayOffset;
    state.epgCategory = "All";
    el.searchResultsSection.classList.add("hidden");
    el.mainContent.classList.remove("hidden");
    switchView("epg");
    renderPlatformPills();
    renderCategoryPills();
    renderDateStrip();
    renderEPG(true);
    requestAnimationFrame(() => {
      const hour = Math.max(0, Math.floor((startMin || 0) / 60));
      scrollEpgToHour(dayOffset === 0 ? "now" : hour);
    });
  }

  function runSearch(query) {
    const q = query.trim().toLowerCase();
    state.searchQuery = q;
    el.clearSearchBtn.classList.toggle("hidden", q.length === 0);

    if (!q) {
      el.searchResultsSection.classList.add("hidden");
      el.mainContent.classList.remove("hidden");
      return;
    }

    el.searchResultsSection.classList.remove("hidden");
    el.mainContent.classList.add("hidden");

    const { tvMatches, streamMatches, channelMatches } = searchAcrossDays(query);
    const liveAndUpcoming = tvMatches.filter((m) => m.status === "live" || m.status === "upcoming");
    const pastMatches = tvMatches.filter((m) => m.status === "past");

    const nextBroadcast = liveAndUpcoming[0];
    const nextSummary = nextBroadcast
      ? ` · Next: ${nextBroadcast.channel.name} (${getDayLabelShort(nextBroadcast.dayOffset)} ${formatTime(nextBroadcast.prog.startMin)})`
      : "";

    el.searchSummary.textContent = `Found ${channelMatches.length} channels, ${liveAndUpcoming.length} live/upcoming, ${pastMatches.length} past broadcasts (-7d..+6d) and ${streamMatches.length} streaming titles for "${query}"${nextSummary}`;

    const isNewTvMatch = ({ prog }) => {
      if (!prog) return false;
      const bStatus = getBroadcastStatus(prog);
      if (bStatus === "New") return true;
      if (bStatus === "Repeat") return false;
      const text = `${prog.title || ""} ${prog.desc || ""}`;
      if (/\b(19\d{2}|200\d|201\d|202[0-4])\b/.test(text)) return false;
      return /\b(brand new|new series|world premiere|series premiere|uk premiere)\b/i.test(text);
    };
    const isNewStreamMatch = (item) => {
      if (!item) return false;
      const curYr = new Date().getFullYear();
      if (item.thisWeek || (item.nextEpisode && item.nextEpisode.airdate)) return true;
      if (Number(item.year) >= curYr) return true;
      const dateMatch = String(item.seasons || "").match(/\b(20\d{2}-\d{2}-\d{2})\b/);
      if (dateMatch) {
        const ageDays = (Date.now() - new Date(`${dateMatch[1]}T12:00:00Z`).getTime()) / 86400000;
        if (ageDays <= 30) return true;
      }
      return false;
    };
    const newTvMatches = tvMatches.filter(isNewTvMatch);
    const newStreamMatches = streamMatches.filter(isNewStreamMatch);
    const filmTvMatches = tvMatches.filter(({ prog }) => prog && (prog.genre === "Film" || /^film:/i.test(prog.title || "")));
    const filmStreamMatches = streamMatches.filter((item) => item && item.type === "Films");

    const filterBar = document.getElementById("searchFilterBar");
    if (filterBar) {
      const tabs = [
        { id: "all", label: `All (${tvMatches.length + streamMatches.length})` },
        { id: "new", label: `✨ New Shows (${newTvMatches.length + newStreamMatches.length})` },
        { id: "films", label: `🎬 Films (${filmTvMatches.length + filmStreamMatches.length})` },
        { id: "next", label: `Live & On Next (${liveAndUpcoming.length})` },
        { id: "past", label: `Past 7 Days (${pastMatches.length})` },
        { id: "stream", label: `Streaming (${streamMatches.length})` }
      ];
      const onDemandPills = ["Netflix", "Channel 4", "BBC iPlayer", "ITVX", "Prime Video", "Disney+", "Pluto TV", "Tubi"]
        .filter((name) => WATCH_PLATFORMS[name])
        .map((name) => {
          const p = WATCH_PLATFORMS[name];
          return `<a class="watch-alt-pill" href="${p.url(encodeURIComponent(query.trim()))}" target="_blank" rel="noopener">${name} &nearr;</a>`;
        })
        .join("");

      const channelStrip = channelMatches.length
        ? `<div style="display:flex; gap:6px; flex-wrap:wrap; width:100%; align-items:center; margin-top:4px;">` +
          `<span style="font-size:12px; color:var(--text-muted); font-weight:600;">Channels:</span>` +
          channelMatches
            .map((c) => {
              const num = c.numbers[state.platform];
              return `<button class="chip-pill" type="button" data-jump-ch="${c.id}" data-jump-day="0" data-jump-min="${getNowMinutes()}">${c.name}${num != null ? ` (${num})` : ""}</button>`;
            })
            .join("") +
          `</div>`
        : "";

      const platName = (PLATFORMS.find((p) => p.id === state.platform) || { name: state.platform }).name;

      filterBar.innerHTML =
        `<div style="display:flex; gap:8px; flex-wrap:wrap; width:100%; align-items:center;">` +
        tabs
          .map((t) => `<button class="chip-pill ${state.searchFilter === t.id ? "active" : ""}" data-search-filter="${t.id}" type="button">${t.label}</button>`)
          .join("") +
        `<button id="searchPlatScopeBtn" class="chip-pill ${state.searchPlatformOnly ? "active" : ""}" type="button">${state.searchPlatformOnly ? `${platName} Only` : "All Platforms"}</button>` +
        `<button id="syncUpcomingSearchBtn" class="chip-pill" type="button" title="Fetch upcoming days (+1 to +6) if not cached yet">🔄 Sync Upcoming Days</button>` +
        `</div>` +
        channelStrip +
        `<div style="display:flex; gap:6px; flex-wrap:wrap; width:100%; align-items:center; margin-top:4px;">` +
        `<span style="font-size:12px; color:var(--text-muted); font-weight:600;">Search UK On-Demand:</span>${onDemandPills}` +
        `</div>`;

      filterBar.querySelectorAll("[data-search-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.searchFilter = btn.dataset.searchFilter || "all";
          runSearch(el.globalSearch.value || query);
        });
      });

      filterBar.querySelectorAll("[data-jump-ch]").forEach((btn) => {
        btn.addEventListener("click", () => {
          jumpToGuideMatch(btn.dataset.jumpCh, Number(btn.dataset.jumpDay), Number(btn.dataset.jumpMin));
        });
      });

      const scopeBtn = document.getElementById("searchPlatScopeBtn");
      if (scopeBtn) {
        scopeBtn.onclick = () => {
          state.searchPlatformOnly = !state.searchPlatformOnly;
          runSearch(el.globalSearch.value || query);
        };
      }

      const syncBtn = document.getElementById("syncUpcomingSearchBtn");
      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.textContent = "Syncing...";
          syncBtn.disabled = true;
          const active = getFilteredChannels("All").slice(0, 120);
          for (let d = 1; d <= 6; d++) {
            await ensureSchedulesForChannels(active, d, false);
          }
          runSearch(el.globalSearch.value || query);
          showToast("Upcoming 6 days synced for search");
        };
      }
    }

    let visibleTv = tvMatches;
    let visibleStream = streamMatches;
    if (state.searchFilter === "new") {
      visibleTv = newTvMatches;
      visibleStream = newStreamMatches;
    } else if (state.searchFilter === "films") {
      visibleTv = filmTvMatches;
      visibleStream = filmStreamMatches;
    } else if (state.searchFilter === "next") {
      visibleTv = liveAndUpcoming;
      visibleStream = [];
    } else if (state.searchFilter === "past") {
      visibleTv = pastMatches;
      visibleStream = [];
    } else if (state.searchFilter === "stream") {
      visibleTv = [];
    }

    const bindTimeMachineJumpButtons = () => {
      el.searchResultsGrid.querySelectorAll("[data-tm-jump-iso]").forEach((btn) => {
        if (btn.dataset.tmBound) return;
        btn.dataset.tmBound = "1";
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const iso = btn.dataset.tmJumpIso;
          closeSearch();
          switchView("epg");
          loadTimeMachineDate(iso);
        });
      });
    };

    const tvHtml = visibleTv
      .slice(0, 120)
      .map(({ prog, channel, dayOffset, status, whenLabel }) => {
        const chNum = channel.numbers[state.platform];
        const platLabel = chNum != null ? `${channel.name} (${chNum})` : channel.name;
        const bStatus = getBroadcastStatus(prog);
        const savedWl = isInWatchlist(prog.id);
        const reminded = state.reminders.has(prog.id);
        return `
        <article class="stream-card" data-prog-id="${prog.id}" data-channel-id="${channel.id}">
          <div class="stream-card-banner" style="background:${channel.color}"></div>
          <div class="stream-card-body">
            <div class="stream-card-top">
              <span class="platform-tag" style="background:${channel.color}">${platLabel}</span>
              <span class="mini-tag ${status === "live" ? "catchup" : ""}">${whenLabel}</span>
            </div>
            <h3 class="stream-card-title">${prog.title}</h3>
            <div class="stream-card-meta">${prog.ep || ""} &bull; ${prog.genre}${bStatus ? ` &bull; <strong>${bStatus}</strong>` : ""}</div>
            <p class="stream-card-desc">${prog.desc || ""}</p>
            <div class="stream-card-footer">
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="chip-pill" type="button" data-jump-ch="${channel.id}" data-jump-day="${dayOffset}" data-jump-min="${prog.startMin}" onclick="event.stopPropagation();">Jump to Guide</button>
                <button class="pill-btn ${savedWl ? "is-active" : ""}" type="button" data-search-wl-prog="${prog.id}" data-search-wl-ch="${channel.id}" onclick="event.stopPropagation();">${savedWl ? "✓ Saved" : "+ Watchlist"}</button>
                ${status === "upcoming" ? `<button class="pill-btn ${reminded ? "is-active" : ""}" type="button" data-search-rem-prog="${prog.id}" data-search-rem-ch="${channel.id}" data-search-rem-day="${dayOffset}" onclick="event.stopPropagation();">${reminded ? "🔔 Set" : "🔔 Remind"}</button>` : ""}
              </div>
              <span style="font-size:12px; font-weight:600; color:var(--brand-red);">Details &rarr;</span>
            </div>
          </div>
        </article>
      `;
      })
      .join("");

    const streamHtml = visibleStream.map(renderStreamCard).join("");
    el.searchResultsGrid.innerHTML =
      tvHtml + streamHtml ||
      `<div class="empty-state" style="grid-column:1/-1;">Searching UK show database for "${query}"...</div>`;
    bindTimeMachineJumpButtons();

    if (q.length >= 2 && (!tvHtml && !streamHtml || state.searchFilter === "all" || state.searchFilter === "new" || state.searchFilter === "next")) {
      fetchLiveShowDirectoryMatches(query).then((dirItems) => {
        if (state.searchQuery !== q) return;
        const filteredDir = state.searchFilter === "new"
          ? dirItems.filter(isNewStreamMatch)
          : state.searchFilter === "next"
            ? dirItems.filter((d) => d.nextEpisode && d.nextEpisode.airdate)
            : dirItems;
        if (!tvHtml && !streamHtml) {
          if (!filteredDir.length) {
            el.searchResultsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No programmes or streaming titles matched "${query}". Try "Sync Upcoming Days" above or switch filter.</div>`;
            return;
          }
          el.searchSummary.textContent = `Not on live UK TV (-7d..+6d), but found ${filteredDir.length} show match(es) for "${query}"`;
          el.searchResultsGrid.innerHTML = filteredDir.map(renderStreamCard).join("");
          bindTimeMachineJumpButtons();
        } else {
          const upcomingOnly = filteredDir.filter((d) => d.nextEpisode && d.nextEpisode.airdate);
          if (upcomingOnly.length) {
            el.searchResultsGrid.insertAdjacentHTML("afterbegin", upcomingOnly.map(renderStreamCard).join(""));
            bindTimeMachineJumpButtons();
          }
        }
      });
    }

    el.searchResultsGrid.querySelectorAll("[data-jump-ch]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        jumpToGuideMatch(btn.dataset.jumpCh, Number(btn.dataset.jumpDay), Number(btn.dataset.jumpMin));
      });
    });
  }

  // ========================================================================
  // Where to Watch Direct Link Resolver
  // ========================================================================
  const WATCH_PLATFORMS = {
    "BBC iPlayer": { color: "#ff4c98", url: (q) => `https://www.bbc.co.uk/iplayer/search?q=${q}` },
    "ITVX": { color: "#2563eb", url: (q) => `https://www.itv.com/watch?q=${q}` },
    "Channel 4": { color: "#1d4ed8", url: (q) => `https://www.channel4.com/search?q=${q}` },
    "My5": { color: "#4338ca", url: (q) => `https://www.channel5.com/search?q=${q}` },
    "Netflix": { color: "#e50914", url: (q) => `https://www.netflix.com/search?q=${q}` },
    "Prime Video": { color: "#00a8e1", url: (q) => `https://www.amazon.co.uk/s?k=${q}&i=instant-video` },
    "Disney+": { color: "#0063e5", url: (q) => `https://www.disneyplus.com/en-gb/search?q=${q}` },
    "Apple TV+": { color: "#1d1d1f", url: (q) => `https://tv.apple.com/gb/search?term=${q}` },
    "Sky / NOW": { color: "#0f766e", url: (q) => `https://www.nowtv.com/gb/watch/search?q=${q}` },
    "NOW": { color: "#0f766e", url: (q) => `https://www.nowtv.com/gb/watch/search?q=${q}` },
    "Paramount+": { color: "#0064ff", url: (q) => `https://www.paramountplus.com/gb/search/?q=${q}` },
    "MUBI": { color: "#1e293b", url: (q) => `https://mubi.com/en/gb/search?query=${q}` },
    "BFI Player": { color: "#be123c", url: (q) => `https://player.bfi.org.uk/search?q=${q}` },
    "discovery+": { color: "#0369a1", url: (q) => `https://www.discoveryplus.com/gb/search?q=${q}` },
    "U": { color: "#3f3f46", url: (q) => `https://u.co.uk/search?q=${q}` },
    "Pluto TV": { color: "#111827", url: (q) => `https://pluto.tv/gb_ie/search/?q=${q}` },
    "Tubi": { color: "#fa382f", url: (q) => `https://tubitv.com/search/${q}` }
  };

  function getLiveStreamUrl(ch) {
    if (!ch) return null;
    if (ch.plutoSlug) return `https://pluto.tv/uk/live-tv/${ch.plutoSlug}`;
    if (ch.tubiId) return `https://tubitv.com/live/${ch.tubiId}`;
    const name = (ch.name || "").toLowerCase();
    const catchup = ch.catchup || "";
    if (catchup === "Tubi") return "https://tubitv.com/live";

    if (/^bbc one/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcone";
    if (/^bbc two/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbctwo";
    if (/^bbc three/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcthree";
    if (/^bbc four/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcfour";
    if (/^cbbc/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/cbbc";
    if (/^cbeebies/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/cbeebies";
    if (/^bbc news/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcnews";
    if (/^bbc parl/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcparliament";
    if (/^bbc alba/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcalba";
    if (/^bbc ?scotland/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/bbcscotland";
    if (/^s4c/i.test(name)) return "https://www.bbc.co.uk/iplayer/live/s4c";

    if (/^itv1/i.test(name)) return "https://www.itv.com/watch?channel=itv";
    if (/^itv2/i.test(name)) return "https://www.itv.com/watch?channel=itv2";
    if (/^itv3/i.test(name)) return "https://www.itv.com/watch?channel=itv3";
    if (/^itv4/i.test(name)) return "https://www.itv.com/watch?channel=itv4";
    if (/^itv quiz|^itvbe/i.test(name)) return "https://www.itv.com/watch?channel=itvquiz";

    if (/^channel 4/i.test(name)) return "https://www.channel4.com/now/C4";
    if (/^e4 extra/i.test(name)) return "https://www.channel4.com/now/E4";
    if (/^e4\b/i.test(name)) return "https://www.channel4.com/now/E4";
    if (/^more4/i.test(name)) return "https://www.channel4.com/now/M4";
    if (/^film4/i.test(name)) return "https://www.channel4.com/now/F4";
    if (/^4seven/i.test(name)) return "https://www.channel4.com/now/4S";

    if (/^5\s*hd$|^channel 5/i.test(name)) return "https://www.channel5.com/live/channel5";
    if (/^5star/i.test(name)) return "https://www.channel5.com/live/5star";
    if (/^5 ?usa/i.test(name)) return "https://www.channel5.com/live/5usa";
    if (/^5action/i.test(name)) return "https://www.channel5.com/live/5action";
    if (/^5drama/i.test(name)) return "https://www.channel5.com/live/5drama";

    if (/^sky news/i.test(name)) return "https://news.sky.com/watch-live";
    if (/^gb news/i.test(name)) return "https://www.gbnews.com/watch/live";
    if (/^al jazeera/i.test(name)) return "https://www.aljazeera.com/live";
    if (/^france 24/i.test(name)) return "https://www.france24.com/en/live";
    if (/^euronews/i.test(name)) return "https://www.euronews.com/live";
    if (/^nhk world/i.test(name)) return "https://www3.nhk.or.jp/nhkworld/en/live/";
    if (/^blaze/i.test(name)) return "https://www.blaze.tv/live";
    if (/^talking ?pictures/i.test(name)) return "https://www.tptvencore.co.uk/Live";

    if (catchup === "U" || /^u&/i.test(name)) return "https://u.co.uk/live";
    if (catchup === "NOW" || /^sky|^comedycent|^cartoon|^boomerang|^challenge|^mtv|^nick/i.test(name)) {
      return ch.sid ? `https://www.nowtv.com/watch/playback/live/${ch.sid}` : "https://www.nowtv.com/watch/home";
    }
    if (catchup === "discovery+") return "https://www.discoveryplus.com/gb/epg";
    if (catchup === "GREAT! player") return "https://www.greatplayer.co.uk/";
    if (catchup === "Watch Free UK") return "https://www.watchfreeuk.co.uk/";
    if (catchup === "Paramount+") return "https://www.paramountplus.com/gb/";
    if (catchup === "BBC iPlayer") return "https://www.bbc.co.uk/iplayer/live";
    if (catchup === "ITVX") return "https://www.itv.com/watch";
    if (catchup === "Channel 4") return "https://www.channel4.com/now/C4";
    if (catchup === "My5") return "https://www.channel5.com/live-tv";
    return null;
  }

  function renderWhereToWatchBlock(rawTitle, primaryPlatform, officialSite, liveOpts = null) {
    const cleanTitle = rawTitle.replace(/^Film:\s*/i, "").trim();
    const q = encodeURIComponent(cleanTitle);
    const ukOverride = resolveUkPlatformForShow(cleanTitle, primaryPlatform);
    const effectivePlatform = ukOverride && WATCH_PLATFORMS[ukOverride.platform] ? ukOverride.platform : primaryPlatform;
    const safeOfficial = sanitizeUkOfficialSite(officialSite);
    const primary = WATCH_PLATFORMS[effectivePlatform];
    const isLiveNow = Boolean(liveOpts && liveOpts.isLive && liveOpts.liveUrl);
    const primaryHref = isLiveNow
      ? liveOpts.liveUrl
      : safeOfficial || (primary ? primary.url(q) : `https://www.justwatch.com/uk/search?q=${q}`);
    const primaryColor = isLiveNow ? "#dc2626" : (primary ? primary.color : "#0f4c5c");
    const primaryLabel = isLiveNow
      ? `Watch Live on ${liveOpts.channelName}`
      : effectivePlatform && effectivePlatform !== "Live TV" && effectivePlatform !== "On Demand"
      ? `Watch on ${effectivePlatform}`
      : "Find Where to Stream";

    const quickCheckList = ["BBC iPlayer", "ITVX", "Channel 4", "My5", "Pluto TV", "Tubi", "Netflix", "Prime Video", "Disney+", "Apple TV+", "Sky / NOW", "Paramount+", "MUBI", "discovery+"]
      .filter((name) => name !== effectivePlatform);

    return `
      <div class="watch-links-box">
        <div class="watch-links-title">${isLiveNow ? "Live Now &bull; Watch Live Stream" : "Where to Watch &amp; Direct Show Link"}</div>
        <div class="watch-primary-row">
          <a id="modalDirectWatchBtn" class="watch-launch-btn" style="background:${primaryColor}" href="${primaryHref}" target="_blank" rel="noopener">
            &#9654; ${isLiveNow ? primaryLabel : (safeOfficial ? `Watch "${cleanTitle}" Directly` : primaryLabel)} &nearr;
          </a>
          ${isLiveNow && liveOpts.liveUrl.startsWith("https://www.nowtv.com/") ? `<a class="watch-launch-btn" style="background:#0f172a" href="https://www.sky.com/watch/sky-go/all" target="_blank" rel="noopener">Sky Go &nearr;</a>` : ""}
          ${isLiveNow && primary ? `<a class="watch-launch-btn" style="background:${primary.color}" href="${safeOfficial || primary.url(q)}" target="_blank" rel="noopener">On Demand (${effectivePlatform}) &nearr;</a>` : ""}
          <a class="watch-launch-btn" style="background:#334155" href="https://www.justwatch.com/uk/search?q=${q}" target="_blank" rel="noopener">
            JustWatch UK &nearr;
          </a>
        </div>
        <div class="watch-alt-row">
          <span style="font-size:11px; color:var(--text-muted); font-weight:600; margin-right:2px;">Search on:</span>
          ${quickCheckList
            .map((name) => `<a class="watch-alt-pill" href="${WATCH_PLATFORMS[name].url(q)}" target="_blank" rel="noopener">${name} &nearr;</a>`)
            .join("")}
        </div>
      </div>
    `;
  }

  function renderReviewsBar(rawTitle, opts = {}) {
    const cleanTitle = rawTitle.replace(/^Film:\s*/i, "").trim();
    const q = encodeURIComponent(cleanTitle);
    const imdbId = opts.imdbId || null;
    const imdbScore = opts.imdbScore || opts.score10 || null;
    const rtSlug = opts.rtSlug || null;
    const rtScore = opts.rtScore || null;

    const imdbHref = imdbId
      ? `https://www.imdb.com/title/${imdbId}/`
      : `https://www.imdb.com/find/?q=${q}`;
    const rtHref = rtSlug
      ? `https://www.rottentomatoes.com/${rtSlug}`
      : `https://www.rottentomatoes.com/search?search=${q}`;

    return `
      <a class="review-badge-link imdb" href="${imdbHref}" target="_blank" rel="noopener">
        &#9733; IMDb ${imdbScore ? `${imdbScore}/10` : (imdbId ? "Page" : "Search")} &nearr;
      </a>
      <a class="review-badge-link rt" href="${rtHref}" target="_blank" rel="noopener">
        &#127813; Rotten Tomatoes ${rtScore ? rtScore : (rtSlug ? "Page" : "Search")} &nearr;
      </a>
    `;
  }

  function enrichModalDirectLink(rawTitle, currentOfficialSite, presetOpts = {}) {
    ONAIR_LIVE.resolveDirectShowLink(rawTitle).then((resolved) => {
      if (!resolved) return;
      const btn = document.getElementById("modalDirectWatchBtn");
      const safeDirect = sanitizeUkOfficialSite(resolved.directUrl);
      if (btn && !presetOpts.isLive && !sanitizeUkOfficialSite(currentOfficialSite) && safeDirect) {
        const cleanTitle = rawTitle.replace(/^Film:\s*/i, "").trim();
        btn.href = safeDirect;
        btn.innerHTML = `&#9654; Watch "${cleanTitle}" Directly &nearr;`;
      }
      const reviewsBar = document.getElementById("modalReviewsBar");
      if (reviewsBar) {
        reviewsBar.innerHTML = renderReviewsBar(rawTitle, {
          imdbId: presetOpts.imdbId || resolved.imdbId,
          imdbScore: presetOpts.imdbScore || resolved.score10,
          rtSlug: presetOpts.rtSlug || resolved.rtSlug,
          rtScore: presetOpts.rtScore || null,
          score10: resolved.score10
        });
      }
      const modalTitleEl = document.getElementById("modalTitle");
      if (!modalTitleEl || (modalTitleEl.dataset.rawTitle || modalTitleEl.textContent) !== rawTitle) return;
      if (resolved.summary) {
        const synEl = el.modalBody && el.modalBody.querySelector(".modal-synopsis");
        if (synEl && (/^Historical broadcast on/i.test(synEl.textContent) || /^Live UK television broadcast/i.test(synEl.textContent))) {
          synEl.textContent = resolved.summary;
        }
      }
      if (resolved.image) {
        const headerWrap = document.getElementById("modalHeaderWrap");
        if (headerWrap && !headerWrap.querySelector("img.modal-poster")) {
          headerWrap.classList.add("modal-header-with-poster");
          const img = document.createElement("img");
          img.className = "modal-poster";
          img.src = resolved.image;
          img.alt = rawTitle;
          headerWrap.prepend(img);
        }
      }
      if (Array.isArray(resolved.castList) && resolved.castList.length) {
        const castEl = document.getElementById("modalCastValue");
        if (castEl) castEl.textContent = resolved.castList.join(", ");
      }
      if (Array.isArray(resolved.crewList) && resolved.crewList.length) {
        const crewWrap = document.getElementById("modalCrewWrap");
        const crewEl = document.getElementById("modalCrewValue");
        if (crewWrap && crewEl) {
          crewEl.textContent = resolved.crewList.join(", ");
          crewWrap.style.display = "";
        }
      }
      if ((Array.isArray(resolved.castList) && resolved.castList.length) || (Array.isArray(resolved.crewList) && resolved.crewList.length)) {
        populateModalSimilarSection({
          title: rawTitle,
          platform: presetOpts.platform || "",
          genre: presetOpts.genre || "",
          desc: resolved.summary || presetOpts.desc || "",
          cast: [...(resolved.castList || []), ...(resolved.crewList || [])].join(", "),
          interests: presetOpts.interests || [],
          isFilm: Boolean(presetOpts.isFilm)
        });
      }
    });
  }

  const similarShowSearchCache = new Map();

  function extractCoreTitleTokens(rawTitle) {
    const clean = String(rawTitle || "")
      .replace(/^(New:\s*|Film:\s*|Live:\s*)/i, "")
      .replace(/\s*[-:–]\s*(Series|Season|Episode|Part|Special|Uncloaked|Unpacked|Extra|Aftersun|Late\s*&\s*Live).*$/i, "")
      .toLowerCase();
    const regionOrNoise = new Set([
      "the", "and", "for", "with", "from", "into", "over", "under", "about", "after", "before",
      "show", "live", "series", "season", "episode", "special", "celebrity", "all", "stars",
      "ireland", "irish", "uk", "british", "britain", "us", "usa", "america", "american",
      "australia", "australian", "italia", "italy", "canada", "canadian", "nz", "zealand",
      "uncloaked", "unpacked", "extra", "companion", "movie", "film"
    ]);
    return clean
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !regionOrNoise.has(w));
  }

  function computeSimilarItems({ title = "", genre = "", desc = "", cast = "", interests = [], isFilm = false }, extraDirItems = []) {
    const cleanTarget = String(title || "").replace(/^(New:\s*|Film:\s*|Live:\s*)/i, "").toLowerCase().trim();
    const titleTokens = extractCoreTitleTokens(title);
    const titleStems = titleTokens.map((w) => w.replace(/s$/, ""));
    const stopWords = new Set(["about", "after", "again", "against", "around", "before", "behind", "between", "during", "episode", "family", "first", "found", "friend", "friends", "group", "house", "lives", "local", "makes", "modern", "night", "other", "people", "place", "series", "season", "small", "story", "their", "there", "these", "things", "three", "through", "today", "together", "under", "until", "where", "which", "while", "world", "years", "young"]);
    const keywords = new Set(
      `${cleanTarget} ${desc || ""}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 5 && !stopWords.has(w))
    );
    const people = String(cast || "")
      .split(",")
      .map((s) => s.replace(/\(.*?\)/g, "").trim())
      .filter((s) => s.length >= 4 && !/^(drama|comedy|entertainment|film|sport|documentary|news|kids|music|thriller|sci-fi|adventure)$/i.test(s));
    const peopleLower = people.map((p) => p.toLowerCase());
    const targetInterests = new Set(Array.isArray(interests) ? interests : []);
    const targetGenre = String(genre || "").toLowerCase();

    const pool = [];
    const seenTitles = new Set([cleanTarget]);

    // 0. Extra live directory / franchise matches (e.g. TVMaze franchise sisters)
    (extraDirItems || []).forEach((item) => {
      const t = String(item.title || "").toLowerCase().trim();
      if (!t || seenTitles.has(t)) return;
      seenTitles.add(t);
      pool.push({
        kind: item.kind || "search",
        id: item.id || "",
        title: item.title,
        badge: item.badge || item.platform || "TV Guide",
        color: item.color || item.platformColor || "#1d4ed8",
        meta: item.meta || `${item.type || "TV Series"} • ${item.genre || ""}`,
        genre: item.genre || genre || "Entertainment",
        isFilm: Boolean(item.isFilm),
        cast: item.cast || "",
        desc: item.desc || "",
        interests: item.interests || [],
        rating: Number(item.rating) || 4.2
      });
    });

    // 1. Streaming + Pluto TV + Tubi catalogue
    getMergedCatalogue().forEach((item) => {
      const t = String(item.title || "").toLowerCase().trim();
      if (!t || seenTitles.has(t)) return;
      seenTitles.add(t);
      pool.push({
        kind: "stream",
        id: item.id,
        title: item.title,
        badge: item.platform,
        color: item.platformColor || "#18181b",
        meta: `${item.type} • ${item.genre} • ${item.year}`,
        genre: item.genre || "",
        isFilm: item.type === "Films",
        cast: item.cast || "",
        desc: item.desc || "",
        interests: item.interests || [],
        rating: Number(item.rating) || 3.8
      });
    });

    // 2. Scan all loaded EPG channels/days for franchise/title matches + Live TV highlights
    if (titleStems.length) {
      const localCache = getCachedStoreForSearch();
      liveChannels.forEach((ch) => {
        for (let d = -2; d <= 4; d++) {
          const progs = getDayScheduleForSearch(ch, d, localCache);
          if (!Array.isArray(progs)) continue;
          progs.forEach((p) => {
            if (!p || !p.title) return;
            const t = String(p.title).replace(/^(New:\s*|Film:\s*)/i, "").toLowerCase().trim();
            if (!t || seenTitles.has(t)) return;
            if (!titleStems.some((stem) => t.includes(stem))) return;
            seenTitles.add(t);
            pool.push({
              kind: "tv",
              id: p.id,
              channelId: ch.id,
              title: p.title,
              badge: ch.name,
              color: ch.color || "#334155",
              meta: `${getDayLabelShort(d)} ${formatTime(p.startMin)} • ${p.genre}`,
              genre: p.genre || "",
              isFilm: p.genre === "Film" || /^film:/i.test(p.title || ""),
              cast: p.cast || "",
              desc: p.desc || "",
              interests: p.interests || [],
              rating: Number(p.stars) || 4.2
            });
          });
        }
      });
    }

    collectTvHighlights().forEach((entry) => {
      const p = entry.prog;
      const ch = entry.channel;
      if (!p || !ch) return;
      const t = String(p.title || "").replace(/^(New:\s*|Film:\s*)/i, "").toLowerCase().trim();
      if (!t || seenTitles.has(t)) return;
      seenTitles.add(t);
      pool.push({
        kind: "tv",
        id: p.id,
        channelId: ch.id,
        title: p.title,
        badge: ch.name,
        color: ch.color || "#334155",
        meta: `${formatTime(p.startMin)} • ${p.genre}`,
        genre: p.genre || "",
        isFilm: p.genre === "Film" || /^film:/i.test(p.title || ""),
        cast: p.cast || "",
        desc: p.desc || "",
        interests: p.interests || [],
        rating: Number(p.stars) || 3.8
      });
    });

    const scored = pool
      .map((cand) => {
        let score = (cand.rating || 3.5) * 2.5;
        const candTitleLower = cand.title.toLowerCase();
        const candGenre = cand.genre.toLowerCase();

        // Massive boost for same-franchise / sister shows (e.g. "The Traitors Ireland" -> "The Traitors", "The Traitors US", "The Traitors Australia")
        titleStems.forEach((stem) => {
          if (stem.length >= 4 && candTitleLower.includes(stem)) {
            score += /\b(telugu|italia|philippines|habibi|españa|polska|qu[eé]bec)\b/i.test(candTitleLower) ? 45 : 135;
          }
        });

        if (targetGenre && candGenre === targetGenre) score += 22;
        else if (isFilm && cand.isFilm) score += 18;
        else if (
          (targetGenre === "drama" && candGenre === "thriller") ||
          (targetGenre === "thriller" && candGenre === "drama") ||
          (targetGenre === "entertainment" && candGenre === "comedy") ||
          (targetGenre === "comedy" && candGenre === "entertainment")
        ) {
          score += 14;
        }
        if (isFilm === cand.isFilm) score += 8;

        (cand.interests || []).forEach((tag) => {
          if (targetInterests.has(tag)) score += 20;
        });

        const candHaystack = `${cand.title} ${cand.desc} ${cand.cast}`.toLowerCase();
        peopleLower.forEach((person) => {
          if (candHaystack.includes(person)) score += 45;
        });

        let kwHits = 0;
        keywords.forEach((kw) => {
          if (kwHits < 4 && candHaystack.includes(kw)) {
            score += 9;
            kwHits++;
          }
        });

        return { cand, score };
      })
      .filter((x) => x.score >= 18)
      .sort((a, b) => b.score - a.score);

    return { items: scored.slice(0, 6).map((x) => x.cand), people: people.slice(0, 3), titleTokens };
  }

  function populateModalSimilarSection(target, extraDirItems = []) {
    const wrap = document.getElementById("modalSimilarWrap");
    if (!wrap) return;
    const { items, people, titleTokens } = computeSimilarItems(target, extraDirItems);
    const franchisePill = titleTokens.length
      ? `<button type="button" class="chip-pill" data-sim-search="${escapeHtml(titleTokens[0])}">🔍 All "${escapeHtml(titleTokens[0].replace(/^./, (c) => c.toUpperCase()))}" Shows</button>`
      : "";
    const searchPills = [
      franchisePill,
      target.genre ? `<button type="button" class="chip-pill" data-sim-search="${escapeHtml(target.genre)}">🔍 More ${escapeHtml(target.genre)}</button>` : "",
      ...people.map((p) => `<button type="button" class="chip-pill" data-sim-search="${escapeHtml(p)}">🎭 ${escapeHtml(p)}</button>`)
    ].filter(Boolean).join("");

    if (!items.length && !searchPills) {
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = `
      <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <span class="info-label" style="margin:0; font-size:12px; letter-spacing:0.04em; text-transform:uppercase;">Shows &amp; Movies Like This</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">${searchPills}</div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(185px, 1fr)); gap:10px;">
          ${items
            .map(
              (it) => `
            <button type="button" class="similar-mini-card" data-sim-kind="${it.kind}" data-sim-id="${escapeHtml(it.id)}" data-sim-ch="${escapeHtml(it.channelId || "")}" data-sim-title="${escapeHtml(it.title)}" style="text-align:left; padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:var(--surface-2, rgba(128,128,128,0.06)); cursor:pointer; display:flex; flex-direction:column; gap:4px; transition:border-color 0.15s;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                <span class="platform-tag" style="background:${it.color}; font-size:10px; padding:2px 6px;">${escapeHtml(it.badge)}</span>
                <span style="font-size:10.5px; color:var(--text-muted);">${escapeHtml(it.genre)}</span>
              </div>
              <div style="font-weight:700; font-size:13px; color:var(--text-primary); line-height:1.25; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(it.title)}</div>
              <div style="font-size:11px; color:var(--text-muted); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(it.desc || it.meta)}</div>
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    wrap.querySelectorAll("[data-sim-kind]").forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.simKind === "stream") {
          openStreamModal(btn.dataset.simId);
        } else if (btn.dataset.simKind === "tv") {
          openProgrammeModal(btn.dataset.simId, btn.dataset.simCh);
        } else {
          const q = btn.dataset.simTitle || "";
          el.detailModal.classList.add("hidden");
          el.globalSearch.value = q;
          runSearch(q);
        }
      };
    });

    wrap.querySelectorAll("[data-sim-search]").forEach((btn) => {
      btn.onclick = () => {
        const q = btn.dataset.simSearch || "";
        el.detailModal.classList.add("hidden");
        el.globalSearch.value = q;
        runSearch(q);
      };
    });

    // Fetch live sister/franchise shows (e.g. "Traitors" -> The Traitors UK, US, Australia, NZ, Italia) once per core token
    if (!extraDirItems.length && titleTokens.length) {
      const qKey = titleTokens.slice(0, 2).join(" ");
      if (similarShowSearchCache.has(qKey)) {
        const cached = similarShowSearchCache.get(qKey);
        if (cached && cached.length) populateModalSimilarSection(target, cached);
      } else {
        similarShowSearchCache.set(qKey, []);
        fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(qKey)}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((rows) => {
            const mapped = (Array.isArray(rows) ? rows : []).slice(0, 6).map((entry) => {
              const s = entry && entry.show;
              if (!s || !s.name) return null;
              const rawNet = (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || "TV Series";
              const country = (s.network && s.network.country && s.network.country.code) || (s.webChannel && s.webChannel.country && s.webChannel.country.code) || "";
              const displayTitle = country && !s.name.toLowerCase().includes(country.toLowerCase()) ? `${s.name} (${country})` : s.name;
              const ukPlat = resolveUkPlatformForShow(displayTitle, rawNet, target.platform || "");
              const summary = String(s.summary || "").replace(/<[^>]+>/g, "").trim();
              const simId = `sim-tvm-${s.id}`;
              const gName = (Array.isArray(s.genres) && s.genres[0]) || target.genre || "Entertainment";
              const starVal = s.rating && s.rating.average ? Math.min(5, Math.max(3, Math.round(s.rating.average / 2))) : 4;
              const fullItem = {
                id: simId,
                title: displayTitle,
                platform: ukPlat.platform,
                platformColor: ukPlat.color,
                type: "TV Series",
                genre: gName,
                seasons: s.status || "Series",
                year: (s.premiered || "").slice(0, 4) || new Date().getFullYear(),
                rating: starVal,
                age: "15",
                cast: (Array.isArray(s.genres) && s.genres.join(", ")) || gName,
                desc: summary || `${displayTitle} streaming in the UK on ${ukPlat.platform}.`,
                image: (s.image && (s.image.medium || s.image.original)) || "",
                officialSite: sanitizeUkOfficialSite(s.officialSite),
                imdbId: (s.externals && s.externals.imdb) || null,
                imdbScore: (s.rating && s.rating.average) || null,
                isLiveData: true
              };
              dynamicSimilarStreamMap.set(simId, fullItem);
              return {
                kind: "stream",
                id: simId,
                title: displayTitle,
                badge: ukPlat.platform,
                color: ukPlat.color,
                genre: gName,
                desc: fullItem.desc,
                rating: starVal
              };
            }).filter(Boolean);
            similarShowSearchCache.set(qKey, mapped);
            const modalTitleEl = document.getElementById("modalTitle");
            if (mapped.length && modalTitleEl && (modalTitleEl.dataset.rawTitle || modalTitleEl.textContent) === target.title) {
              populateModalSimilarSection(target, mapped);
            }
          })
          .catch(() => {});
      }
    }
  }

  // ========================================================================
  // Detail Modal
  // ========================================================================
  function findProgrammeById(progId, channelId) {
    const ch = liveChannels.find((c) => c.id === channelId);
    if (!ch) return null;
    const currentProgs = getSchedule(channelId, state.dayOffset);
    if (currentProgs) {
      const hit = currentProgs.find((p) => p.id === progId);
      if (hit) return hit;
    }
    const localCache = getCachedStoreForSearch();
    for (let d = -7; d <= 6; d++) {
      const dayProgs = getDayScheduleForSearch(ch, d, localCache);
      if (Array.isArray(dayProgs)) {
        const hit = dayProgs.find((p) => p.id === progId);
        if (hit) return hit;
      }
    }
    return null;
  }

  function openProgrammeModal(progId, channelId) {
    const ch = liveChannels.find((c) => c.id === channelId);
    const prog = findProgrammeById(progId, channelId);
    if (!ch || !prog) return;

    const saved = isInWatchlist(prog.id);
    const hasRem = state.reminders.has(prog.id);
    const chNum = ch.numbers[state.platform];
    const nowMin = getNowMinutes();
    const isLive = state.dayOffset === 0 && nowMin >= prog.startMin && nowMin < prog.endMin;
    const liveUrl = isLive ? getLiveStreamUrl(ch) : null;
    const starInfo = getEditorialStarInfo(prog, ch);

    el.modalBody.innerHTML = `
      <div id="modalHeaderWrap" class="${prog.image ? "modal-header-with-poster" : ""}">
        ${prog.image ? `<img class="modal-poster" src="${prog.image}" alt="${prog.title}" />` : ""}
        <div>
          <div class="modal-kicker">
            <span class="platform-tag" style="background:${ch.color}">${ch.name}${chNum ? ` &bull; Ch ${chNum}` : ""}</span>
            ${starInfo ? `<span class="mini-tag rt-pick">&#9733; ${escapeHtml(starInfo.label)}</span>` : ""}
            <span class="mini-tag">${prog.genre}</span>
            <span class="mini-tag">Cert ${prog.rating}</span>
            ${isLive ? `<span class="mini-tag live">LIVE NOW</span>` : prog.isLiveData ? `<span class="mini-tag catchup">LIVE EPG</span>` : ""}
            ${getBroadcastStatus(prog) === "New" ? `<span class="mini-tag live">NEW</span>` : getBroadcastStatus(prog) === "Repeat" ? `<span class="mini-tag">REPEAT</span>` : ""}
          </div>
          <h2 id="modalTitle" class="modal-title" data-raw-title="${escapeHtml(prog.title)}">${starInfo ? `<span class="rt-pick-star" style="font-size:18px;" title="&#9733; ${escapeHtml(starInfo.label)}">&#9733;</span>` : ""}${prog.title}</h2>
          <div class="modal-meta-line">
            <span><strong>${formatTime(prog.startMin)} – ${formatTime(prog.endMin)}</strong></span>
            <span>&bull; ${prog.ep}</span>
            ${prog.stars ? `<span class="star-rating">&bull; ${formatStars(prog.stars)}</span>` : ""}
          </div>
        </div>
      </div>
      <p class="modal-synopsis">${prog.desc}</p>
      <div id="modalReviewsBar" class="reviews-bar">${renderReviewsBar(prog.title)}</div>
      <div class="modal-info-grid">
        <div>
          <span class="info-label">Cast / Genres</span>
          <span id="modalCastValue">${prog.cast}</span>
        </div>
        <div>
          <span class="info-label">Catch-Up &amp; Broadcast</span>
          <span>${ch.name} &bull; <strong>${ch.catchup}</strong></span>
        </div>
        <div id="modalCrewWrap" style="display:none; grid-column:1/-1;">
          <span class="info-label">Crew</span>
          <span id="modalCrewValue"></span>
        </div>
      </div>
      ${renderWhereToWatchBlock(prog.title, ch.catchup, prog.officialSite, isLive ? { isLive: true, liveUrl, channelName: ch.name } : null)}
      <div class="modal-actions" style="flex-wrap:wrap;">
        <button class="btn-primary" id="modalWatchlistBtn" type="button">
          ${saved ? "✓ Saved in Watchlist" : "+ Add to Watchlist"}
        </button>
        <button class="ghost-btn" id="modalReminderBtn" type="button">
          ${hasRem ? "🔔 Reminder Set" : "🔔 Notify Me"}
        </button>
        <button class="ghost-btn" id="modalCalendarBtn" type="button">📅 Add to Calendar (.ics)</button>
        <a class="ghost-btn" id="modalEmailBtn" href="mailto:?subject=${encodeURIComponent(`TV Reminder: ${prog.title} on ${ch.name}`)}&body=${encodeURIComponent(`${prog.title}\nChannel: ${ch.name}\nTime: ${formatTime(prog.startMin)}–${formatTime(prog.endMin)} (${state.timeMachineDate || getSkyDateStrForOffset(state.dayOffset).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")})\n\n${prog.desc || ""}`)}" style="text-decoration:none;">✉️ Email Reminder</a>
      </div>
      <div id="modalSimilarWrap"></div>
    `;

    const activeIsoDate = state.timeMachineDate || getSkyDateStrForOffset(state.dayOffset).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

    document.getElementById("modalWatchlistBtn").onclick = () => {
      toggleWatchlist({
        id: prog.id,
        kind: "tv",
        title: prog.title,
        subtitle: `${ch.name} (${activeIsoDate} ${formatTime(prog.startMin)})`,
        channelId: ch.id
      });
      openProgrammeModal(progId, channelId);
    };

    document.getElementById("modalCalendarBtn").onclick = () => {
      downloadReminderIcs(prog.title, ch.name, activeIsoDate, prog.startMin, prog.endMin, prog.desc);
      showToast(`Calendar reminder (.ics) downloaded for ${prog.title}`);
    };

    document.getElementById("modalReminderBtn").onclick = async () => {
      if (state.reminders.has(prog.id)) {
        state.reminders.delete(prog.id);
        state.reminderItems = state.reminderItems.filter((r) => r.id !== prog.id);
        showToast(`Reminder removed for ${prog.title}`);
      } else {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          try {
            await Notification.requestPermission();
          } catch {
            // Ignore permission prompt errors
          }
        }
        state.reminders.add(prog.id);
        state.reminderItems = [
          ...state.reminderItems.filter((r) => r.id !== prog.id),
          { id: prog.id, title: prog.title, channelName: ch.name, isoDate: activeIsoDate, startMin: prog.startMin, endMin: prog.endMin, alerted: false }
        ];
        const permNote = typeof Notification !== "undefined" && Notification.permission === "granted"
          ? "Browser notification + alert set"
          : "In-app alert set (allow notifications or use Add to Calendar for background alerts)";
        showToast(`${permNote} for ${prog.title} (${formatTime(prog.startMin)})`);
      }
      localStorage.setItem("onair_reminders", JSON.stringify([...state.reminders]));
      localStorage.setItem("onair_reminder_items", JSON.stringify(state.reminderItems));
      openProgrammeModal(progId, channelId);
    };

    el.detailModal.classList.remove("hidden");
    const isFilmProg = prog.genre === "Film" || /^film:/i.test(prog.title || "");
    populateModalSimilarSection({
      title: prog.title,
      platform: ch.catchup || "",
      genre: prog.genre || "",
      desc: prog.desc || "",
      cast: prog.cast || "",
      interests: prog.interests || [],
      isFilm: isFilmProg
    });
    enrichModalDirectLink(prog.title, prog.officialSite, {
      isLive,
      platform: ch.catchup || "",
      genre: prog.genre || "",
      desc: prog.desc || "",
      interests: prog.interests || [],
      isFilm: isFilmProg
    });
  }

  function openStreamModal(streamId) {
    const item = getMergedCatalogue().find((s) => s.id === streamId) || dynamicSimilarStreamMap.get(streamId);
    if (!item) return;

    const saved = isInWatchlist(item.id);
    const starInfo = getEditorialStarInfo(item, null);
    el.modalBody.innerHTML = `
      <div id="modalHeaderWrap" class="${item.image ? "modal-header-with-poster" : ""}">
        ${item.image ? `<img class="modal-poster" src="${item.image}" alt="${item.title}" />` : ""}
        <div>
          <div class="modal-kicker">
            <span class="platform-tag" style="background:${item.platformColor}">${item.platform}</span>
            ${starInfo ? `<span class="mini-tag rt-pick">&#9733; ${escapeHtml(starInfo.label)}</span>` : ""}
            <span class="mini-tag">${item.type}</span>
            <span class="mini-tag">${item.genre}</span>
            <span class="mini-tag">Cert ${item.age}</span>
            ${item.isLiveData ? `<span class="mini-tag catchup">LIVE SYNC</span>` : ""}
          </div>
          <h2 id="modalTitle" class="modal-title" data-raw-title="${escapeHtml(item.title)}">${starInfo ? `<span class="rt-pick-star" style="font-size:18px;" title="&#9733; ${escapeHtml(starInfo.label)}">&#9733;</span>` : ""}${item.title}</h2>
          <div class="modal-meta-line">
            <span class="star-rating">${formatStars(item.rating)}</span>
            <span>&bull; ${item.seasons}</span>
            <span>&bull; ${item.year}</span>
          </div>
        </div>
      </div>
      <p class="modal-synopsis">${item.desc}</p>
      <div id="modalReviewsBar" class="reviews-bar">${renderReviewsBar(item.title, {
        imdbId: item.imdbId,
        imdbScore: item.imdbScore,
        rtSlug: item.rtSlug,
        rtScore: item.rtScore
      })}</div>
      <div class="modal-info-grid">
        <div>
          <span class="info-label">Starring / Genres</span>
          <span id="modalCastValue">${item.cast}</span>
        </div>
        <div>
          <span class="info-label">Primary Platform</span>
          <span>Streaming on <strong>${item.platform}</strong></span>
        </div>
        <div id="modalCrewWrap" style="display:none; grid-column:1/-1;">
          <span class="info-label">Crew</span>
          <span id="modalCrewValue"></span>
        </div>
      </div>
      ${renderWhereToWatchBlock(item.title, item.platform, item.officialSite)}
      <div class="modal-actions">
        <button class="btn-primary" id="modalWatchlistBtn" type="button">
          ${saved ? "✓ Saved in Watchlist" : "+ Add to Watchlist"}
        </button>
      </div>
      <div id="modalSimilarWrap"></div>
    `;

    document.getElementById("modalWatchlistBtn").onclick = () => {
      toggleWatchlist({
        id: item.id,
        kind: "stream",
        title: item.title,
        subtitle: `${item.platform} • ${item.type}`
      });
      openStreamModal(streamId);
    };

    el.detailModal.classList.remove("hidden");
    populateModalSimilarSection({
      title: item.title,
      platform: item.platform || "",
      genre: item.genre || "",
      desc: item.desc || "",
      cast: item.cast || "",
      interests: item.interests || [],
      isFilm: item.type === "Films"
    });
    enrichModalDirectLink(item.title, item.officialSite, {
      imdbId: item.imdbId,
      imdbScore: item.imdbScore,
      rtSlug: item.rtSlug,
      rtScore: item.rtScore,
      platform: item.platform || "",
      genre: item.genre || "",
      desc: item.desc || "",
      interests: item.interests || [],
      isFilm: item.type === "Films"
    });
  }

  // ========================================================================
  // Watchlist
  // ========================================================================
  function isInWatchlist(id) {
    return state.watchlist.some((w) => w.id === id);
  }

  function toggleWatchlist(entry) {
    const idx = state.watchlist.findIndex((w) => w.id === entry.id);
    if (idx >= 0) {
      state.watchlist.splice(idx, 1);
      showToast(`Removed "${entry.title}" from Watchlist`);
    } else {
      state.watchlist.unshift(entry);
      showToast(`Added "${entry.title}" to Watchlist`);
    }
    localStorage.setItem("onair_watchlist", JSON.stringify(state.watchlist));
    renderWatchlist();
    if (state.view === "streaming") renderStreaming();
  }

  function renderWatchlist() {
    el.watchlistCount.textContent = state.watchlist.length;
    if (state.watchlist.length === 0) {
      el.watchlistItems.innerHTML = `
        <div class="empty-state">
          <p><strong>Your Watchlist is empty</strong></p>
          <p>Click any TV show or streaming film to save it here for later.</p>
        </div>
      `;
      return;
    }

    el.watchlistItems.innerHTML = state.watchlist
      .map(
        (item) => `
        <div class="watchlist-item">
          <div>
            <div class="watchlist-item-title" data-wl-open="${item.id}" data-wl-kind="${item.kind}" data-wl-ch="${item.channelId || ""}">
              ${item.title}
            </div>
            <div class="watchlist-item-meta">${item.subtitle}</div>
          </div>
          <button class="remove-wl-btn" data-wl-remove="${item.id}" type="button" aria-label="Remove">&times;</button>
        </div>
      `
      )
      .join("");
  }

  // ========================================================================
  // Event Listeners
  // ========================================================================
  function bindEvents() {
    // Primary View Tabs
    el.navTabs.forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    // Platform Switcher (delegated)
    document.addEventListener("click", (e) => {
      const platBtn = e.target.closest("[data-platform]");
      if (platBtn) {
        state.platform = platBtn.dataset.platform;
        localStorage.setItem("onair_platform", state.platform);
        renderPlatformPills();
        if (state.view === "epg") renderEPG();
        if (state.view === "now-next") renderNowNext();
        return;
      }

      const catBtn = e.target.closest("[data-cat]");
      if (catBtn) {
        state.epgCategory = catBtn.dataset.cat;
        renderCategoryPills();
        renderEPG();
        return;
      }

      const nnCatBtn = e.target.closest("[data-nncat]");
      if (nnCatBtn) {
        state.nowNextCategory = nnCatBtn.dataset.nncat;
        renderCategoryPills();
        renderNowNext();
        return;
      }

      const dateBtn = e.target.closest("[data-day]");
      if (dateBtn) {
        state.dayOffset = Number(dateBtn.dataset.day);
        if (state.timeMachineDate) exitTimeMachine();
        renderDateStrip();
        renderEPG(true);
        return;
      }

      const wtwWeekBtn = e.target.closest("[data-wtw-week]");
      if (wtwWeekBtn) {
        state.wtwWeekFilter = wtwWeekBtn.dataset.wtwWeek;
        document.querySelectorAll("[data-wtw-week]").forEach((b) =>
          b.classList.toggle("is-active", b.dataset.wtwWeek === state.wtwWeekFilter)
        );
        renderWhatToWatch();
        return;
      }

      const wtwModeBtn = e.target.closest("[data-wtw-mode]");
      if (wtwModeBtn) {
        state.wtwModeFilter = wtwModeBtn.dataset.wtwMode;
        document.querySelectorAll("[data-wtw-mode]").forEach((b) =>
          b.classList.toggle("is-active", b.dataset.wtwMode === state.wtwModeFilter)
        );
        renderWhatToWatch();
        return;
      }

      const wtwStarBtn = e.target.closest("[data-wtw-stars]");
      if (wtwStarBtn) {
        state.wtwMinStars = Number(wtwStarBtn.dataset.wtwStars);
        document.querySelectorAll("[data-wtw-stars]").forEach((b) =>
          b.classList.toggle("is-active", Number(b.dataset.wtwStars) === state.wtwMinStars)
        );
        renderWhatToWatch();
        return;
      }

      const interestBtn = e.target.closest("[data-interest]");
      if (interestBtn) {
        const cat = interestBtn.dataset.interest;
        if (state.interests.has(cat)) state.interests.delete(cat);
        else state.interests.add(cat);
        localStorage.setItem("onair_interests", JSON.stringify([...state.interests]));
        renderWhatToWatch();
        return;
      }

      const jumpBtn = e.target.closest("[data-jump]");
      if (jumpBtn) {
        scrollEpgToHour(jumpBtn.dataset.jump);
        return;
      }

      const favBtn = e.target.closest("[data-fav-channel]");
      if (favBtn) {
        e.stopPropagation();
        const cid = favBtn.dataset.favChannel;
        if (state.favorites.has(cid)) {
          state.favorites.delete(cid);
          showToast("Removed from Favorite Channels");
        } else {
          state.favorites.add(cid);
          showToast("Added to Favorite Channels");
        }
        localStorage.setItem("onair_favorites", JSON.stringify([...state.favorites]));
        renderEPG();
        return;
      }

      const searchWlProgBtn = e.target.closest("[data-search-wl-prog]");
      if (searchWlProgBtn) {
        e.stopPropagation();
        const pid = searchWlProgBtn.dataset.searchWlProg;
        const cid = searchWlProgBtn.dataset.searchWlCh;
        const ch = liveChannels.find((c) => c.id === cid);
        const found = findProgrammeById(pid, cid);
        if (found && ch) {
          toggleWatchlist({
            id: found.id,
            kind: "tv",
            channelId: ch.id,
            title: found.title,
            subtitle: `${ch.name} • ${formatTime(found.startMin)}`
          });
          if (state.searchQuery) runSearch(state.searchQuery);
        }
        return;
      }

      const searchRemProgBtn = e.target.closest("[data-search-rem-prog]");
      if (searchRemProgBtn) {
        e.stopPropagation();
        const pid = searchRemProgBtn.dataset.searchRemProg;
        const cid = searchRemProgBtn.dataset.searchRemCh;
        const dOff = Number(searchRemProgBtn.dataset.searchRemDay || 0);
        const ch = liveChannels.find((c) => c.id === cid);
        const found = findProgrammeById(pid, cid);
        if (found && ch) {
          if (state.reminders.has(pid)) {
            state.reminders.delete(pid);
            state.reminderItems = state.reminderItems.filter((r) => r.id !== pid);
            showToast(`Reminder removed for "${found.title}"`);
          } else {
            state.reminders.add(pid);
            const iso = getSkyDateStrForOffset(dOff).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
            state.reminderItems = [
              ...state.reminderItems.filter((r) => r.id !== pid),
              { id: pid, title: found.title, channelName: ch.name, startMin: found.startMin, endMin: found.endMin, isoDate: iso, notified: false }
            ];
            if (typeof Notification !== "undefined" && Notification.permission === "default") {
              Notification.requestPermission().catch(() => {});
            }
            showToast(`🔔 Reminder set for "${found.title}" (${formatTime(found.startMin)})`);
          }
          localStorage.setItem("onair_reminders", JSON.stringify([...state.reminders]));
          localStorage.setItem("onair_reminder_items", JSON.stringify(state.reminderItems));
          if (state.searchQuery) runSearch(state.searchQuery);
        }
        return;
      }

      const wlStreamBtn = e.target.closest("[data-toggle-wl-stream]");
      if (wlStreamBtn) {
        e.stopPropagation();
        const item = getMergedCatalogue().find((s) => s.id === wlStreamBtn.dataset.toggleWlStream);
        if (item) {
          toggleWatchlist({
            id: item.id,
            kind: "stream",
            title: item.title,
            subtitle: `${item.platform} • ${item.type}`
          });
        }
        return;
      }

      const progEl = e.target.closest("[data-prog-id]");
      if (progEl) {
        openProgrammeModal(progEl.dataset.progId, progEl.dataset.channelId);
        return;
      }

      const streamEl = e.target.closest("[data-stream-id]");
      if (streamEl) {
        openStreamModal(streamEl.dataset.streamId);
        return;
      }

      // Streaming Filters
      const spBtn = e.target.closest("[data-sp]");
      if (spBtn) {
        state.streamPlatform = spBtn.dataset.sp;
        renderStreaming();
        return;
      }
      const stBtn = e.target.closest("[data-st]");
      if (stBtn) {
        state.streamType = stBtn.dataset.st;
        renderStreaming();
        return;
      }
      const sgBtn = e.target.closest("[data-sg]");
      if (sgBtn) {
        state.streamGenre = sgBtn.dataset.sg;
        renderStreaming();
        return;
      }
      const swinBtn = e.target.closest("[data-swin]");
      if (swinBtn) {
        state.streamWindow = swinBtn.dataset.swin;
        renderStreaming();
        return;
      }

      // Watchlist Drawer Items
      const wlRemove = e.target.closest("[data-wl-remove]");
      if (wlRemove) {
        const entry = state.watchlist.find((w) => w.id === wlRemove.dataset.wlRemove);
        if (entry) toggleWatchlist(entry);
        return;
      }

      const wlOpen = e.target.closest("[data-wl-open]");
      if (wlOpen) {
        el.watchlistDrawer.classList.add("hidden");
        if (wlOpen.dataset.wlKind === "stream") {
          openStreamModal(wlOpen.dataset.wlOpen);
        } else {
          openProgrammeModal(wlOpen.dataset.wlOpen, wlOpen.dataset.wlCh);
        }
      }
    });

    el.streamSortSelect.addEventListener("change", (e) => {
      state.streamSort = e.target.value;
      renderStreaming();
    });

    // Search
    el.globalSearch.addEventListener("input", (e) => runSearch(e.target.value));
    el.clearSearchBtn.addEventListener("click", () => {
      el.globalSearch.value = "";
      runSearch("");
    });
    el.closeSearchResults.addEventListener("click", () => {
      el.globalSearch.value = "";
      runSearch("");
    });

    // Modals & Drawers
    el.closeModalBtn.addEventListener("click", () => el.detailModal.classList.add("hidden"));
    el.detailModal.addEventListener("click", (e) => {
      if (e.target === el.detailModal) el.detailModal.classList.add("hidden");
    });

    el.watchlistBtn.addEventListener("click", () => el.watchlistDrawer.classList.remove("hidden"));
    el.closeDrawerBtn.addEventListener("click", () => el.watchlistDrawer.classList.add("hidden"));
    el.watchlistDrawer.addEventListener("click", (e) => {
      if (e.target === el.watchlistDrawer) el.watchlistDrawer.classList.add("hidden");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        el.detailModal.classList.add("hidden");
        el.watchlistDrawer.classList.add("hidden");
      }
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        el.globalSearch.focus();
      } else if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && state.view === "epg") {
        scrollEpgToHour("now");
      }
    });

    const chFilterInput = document.getElementById("epgChannelFilterInput");
    if (chFilterInput) {
      chFilterInput.addEventListener("input", (e) => {
        state.epgChannelQuery = e.target.value || "";
        renderEPG(false);
      });
    }

    window.addEventListener("onair:idb-hydrated", () => {
      if (state.view === "settings") renderSettings();
    });

    // Theme Toggle (cycles: System -> Light -> Dark)
    el.themeToggleBtn.addEventListener("click", () => {
      const order = ["system", "light", "dark"];
      const next = order[(order.indexOf(state.theme) + 1) % order.length];
      state.theme = next;
      applyTheme();
      if (state.view === "settings") renderSettings();
      const labels = { system: "Match System (Auto)", light: "Light", dark: "Dark" };
      showToast(`Theme: ${labels[next]}`);
    });

    // Feed Source Filter Pills
    el.feedSourcePills.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-feed-source]");
      if (!btn) return;
      state.feedSource = btn.dataset.feedSource;
      renderLiveFeeds();
    });

    // Live Refresh Buttons
    el.liveRefreshBtn.addEventListener("click", () => syncLiveData(true));
    if (el.feedsRefreshBtn) {
      el.feedsRefreshBtn.addEventListener("click", () => syncLiveData(true));
    }
    if (el.clearInterestsBtn) {
      el.clearInterestsBtn.addEventListener("click", () => {
        state.interests.clear();
        localStorage.setItem("onair_interests", "[]");
        renderWhatToWatch();
      });
    }
  }

  // ========================================================================
  // Live Feeds Rendering & Auto-Refresh (Unified Multi-Source Grid)
  // ========================================================================
  function renderLiveFeeds() {
    const sources = ["All", ...new Set(liveFeedItems.map((i) => i.sourceName))];
    el.feedSourcePills.innerHTML = sources
      .map(
        (s) =>
          `<button class="pill-btn ${state.feedSource === s ? "is-active" : ""}" data-feed-source="${s}" type="button">${s === "All" ? "All Sources" : s}</button>`
      )
      .join("");

    const filtered =
      state.feedSource === "All"
        ? liveFeedItems
        : liveFeedItems.filter((i) => i.sourceName === state.feedSource);

    if (filtered.length === 0) {
      el.unifiedFeedGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Loading live UK TV, streaming &amp; film feeds...</div>`;
      return;
    }

    el.unifiedFeedGrid.innerHTML = filtered
      .map(
        (item) => `
        <a class="stream-card" style="text-decoration:none; color:inherit;" href="${item.link}" target="_blank" rel="noopener">
          <div class="stream-card-banner" style="background:${item.sourceColor}"></div>
          <div class="stream-card-body">
            <div class="stream-card-top">
              <span class="platform-tag" style="background:${item.sourceColor}">${item.sourceName}</span>
              <span class="mini-tag">${item.pubDate ? item.pubDate.slice(0, 10) : "Latest"}</span>
            </div>
            ${item.thumbnail ? `<img style="width:100%; height:140px; object-fit:cover; border-radius:6px;" src="${item.thumbnail}" alt="" loading="lazy" />` : ""}
            <h3 class="stream-card-title">${item.title}</h3>
            <p class="stream-card-desc">${item.description}</p>
            <div class="stream-card-footer">
              <span class="feed-card-meta">${item.author}</span>
              <span style="font-size:12px; font-weight:600; color:var(--brand-red);">Read &nearr;</span>
            </div>
          </div>
        </a>
      `
      )
      .join("");
  }

  let lastFullRefreshTs = 0;

  async function syncLiveData(force = false, bypassCooldown = false) {
    if (force && !bypassCooldown) {
      const waitSec = Math.ceil((lastFullRefreshTs + 15000 - Date.now()) / 1000);
      if (waitSec > 0) {
        showToast(`Please wait ${waitSec}s before refreshing the TV Guide again (prevents rate-limit blocks)`);
        return;
      }
      lastFullRefreshTs = Date.now();
    }
    el.liveRefreshBtn.classList.add("is-syncing");
    el.liveStatusText.textContent = "Syncing Live EPG...";

    try {
      const [channels, streamItems, rssItems] = await Promise.all([
        ONAIR_LIVE.fetchLiveChannels(force).catch(() => null),
        ONAIR_LIVE.fetchLiveStreaming(force).catch(() => []),
        ONAIR_LIVE.fetchRssFeeds(force).catch(() => [])
      ]);

      if (channels && channels.length) {
        const extraKeep = liveChannels.filter((c) => c.plutoSlug || c.tubiId);
        liveChannels = extraKeep.length ? [...channels, ...extraKeep] : channels;
      }
      if (streamItems && streamItems.length) {
        liveStreamingItems = streamItems;
      }
      if (Array.isArray(rssItems) && rssItems.length) {
        liveFeedItems = rssItems;
      }

      if (force) {
        liveEpgByDay.delete(state.dayOffset);
      }

      // Fetch real live EPG schedules for visible channels on current day
      const visibleChannels = getFilteredChannels(state.epgCategory);
      await ensureSchedulesForChannels(visibleChannels, state.dayOffset, force);

      const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const vaultCount = ONAIR_LIVE.getVaultStats ? ONAIR_LIVE.getVaultStats().showsCached : 0;
      el.liveStatusText.textContent = vaultCount > 0
        ? `Live EPG • ${timeStr} • ${vaultCount} cached`
        : `Live EPG • ${timeStr}`;

      if (state.view === "epg") renderEPG(false);
      else if (state.view === "now-next") renderNowNext(false);
      else if (state.view === "what-to-watch") renderWhatToWatch();
      else if (state.view === "streaming") renderStreaming();
      else if (state.view === "live-feeds") renderLiveFeeds();

      if (force) {
        const health = ONAIR_LIVE.getFeedHealth ? ONAIR_LIVE.getFeedHealth() : {};
        if (health.backoffHosts && health.backoffHosts.length) {
          showToast(`Rate-limited by ${health.backoffHosts.join(", ")} — paused 5m. Wait ~5 mins before refreshing again.`);
        } else if (
          (health.sky && health.sky.status === "error") ||
          (health.pluto && health.pluto.status === "error") ||
          (health.tubi && health.tubi.status === "error")
        ) {
          showToast("Some feeds had errors — using cached/snapshot fallback. Wait ~60s before retrying.");
        } else {
          showToast("Live UK TV EPG & streaming feeds refreshed");
        }
      }
    } catch {
      el.liveStatusText.textContent = "Offline Mode";
      if (force) showToast("Live EPG sync hit an error — using cached guide. Wait ~60s before retrying.");
    } finally {
      el.liveRefreshBtn.classList.remove("is-syncing");
    }
  }

  // Live-only updater: refreshes ONLY TV schedule, What's On & recommendations
  // without re-fetching stored streaming metadata, IMDb/RT scores, or show links.
  async function refreshLiveScheduleOnly() {
    try {
      liveEpgByDay.delete(state.dayOffset);
      const visibleChannels = getFilteredChannels(state.epgCategory);
      await ensureSchedulesForChannels(visibleChannels, state.dayOffset, true);

      const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const vaultCount = ONAIR_LIVE.getVaultStats ? ONAIR_LIVE.getVaultStats().showsCached : 0;
      el.liveStatusText.textContent = vaultCount > 0
        ? `Live EPG • ${timeStr} • ${vaultCount} cached`
        : `Live EPG • ${timeStr}`;

      if (state.view === "epg") renderEPG(false);
      else if (state.view === "now-next") renderNowNext(false);
      else if (state.view === "what-to-watch") renderWhatToWatch();
    } catch {
      // Keep existing schedule on transient network error
    }
  }

  // ========================================================================
  // Settings & Data Storage
  // ========================================================================
  let liveRefreshTimerId = null;
  let lastManualRefreshTs = 0;

  function scheduleAutoRefresh() {
    if (liveRefreshTimerId) {
      clearInterval(liveRefreshTimerId);
      liveRefreshTimerId = null;
    }
    if (!state.lowDataMode && state.refreshMins > 0) {
      liveRefreshTimerId = setInterval(() => refreshLiveScheduleOnly(), state.refreshMins * 60 * 1000);
    }
  }

  function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderSettings() {
    if (!el.settingsContainer) return;
    const report = ONAIR_LIVE.getStorageReport
      ? ONAIR_LIVE.getStorageReport()
      : { repoUpdatedAt: null, repoShowsCount: 0, repoStreamingCount: 0, mergedShowsCount: 0, localShowsCount: 0, epgDaysCached: 0, totalStorageKb: "0.0" };
    const health = ONAIR_LIVE.getFeedHealth
      ? ONAIR_LIVE.getFeedHealth()
      : { sky: { status: "idle", note: "Unknown" }, pluto: { status: "idle", note: "Unknown" }, tubi: { status: "idle", note: "Unknown" }, effectiveTtlMins: 30, backoffHosts: [] };
    const snap = typeof window !== "undefined" && window.ONAIR_FAST_EPG_SNAPSHOT;
    const snapLabel = snap && snap.generatedAt
      ? `${snap.dateStr} (${new Date(snap.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })})`
      : "Not loaded";

    const updatedLabel = report.repoUpdatedAt
      ? new Date(report.repoUpdatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
      : "Not generated yet";

    el.settingsContainer.innerHTML = `
      <div class="settings-card">
        <h2>Display, Platform &amp; Seasonal Preferences</h2>
        <p class="settings-card-desc">Control appearance, default platform, and seasonal spotlight behaviour across OnAir UK.</p>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Appearance Theme</strong>
            <span>Switch between Light editorial mode and Dark mode.</span>
          </div>
          <select id="settingThemeSelect" class="settings-select">
            <option value="system" ${state.theme === "system" ? "selected" : ""}>Match System (Auto)</option>
            <option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option>
            <option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option>
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Default TV Platform</strong>
            <span>Channel numbering used across TV Guide &amp; Now &amp; Next.</span>
          </div>
          <select id="settingPlatformSelect" class="settings-select">
            ${PLATFORMS.map((p) => `<option value="${p.id}" ${state.platform === p.id ? "selected" : ""}>${p.name}</option>`).join("")}
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>TV Region (UK &amp; Ireland)</strong>
            <span>Sets regional BBC One, UTV/STV/ITV1, S4C, RTÉ1, RTÉ2 &amp; TG4 schedules.</span>
          </div>
          <select id="settingRegionSelect" class="settings-select">
            ${(ONAIR_LIVE.REGIONS || []).map((r) => `<option value="${r.id}" ${ONAIR_LIVE.getRegion && ONAIR_LIVE.getRegion().id === r.id ? "selected" : ""}>${r.name}</option>`).join("")}
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Seasonal Spotlight &amp; Filter</strong>
            <span>Auto-updates year-round by date, or preview any season anytime.</span>
          </div>
          <select id="settingSeasonSelect" class="settings-select">
            <option value="auto" ${state.seasonOverride === "auto" ? "selected" : ""}>Auto (${getAutoSeason().chip} · ${getAutoSeason().windowLabel})</option>
            ${SEASON_CALENDAR.map((s) => `<option value="${s.id}" ${state.seasonOverride === s.id ? "selected" : ""}>${s.chip} (${s.windowLabel})</option>`).join("")}
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Default Startup View</strong>
            <span>Choose which tab opens first when you launch OnAir UK.</span>
          </div>
          <select id="settingDefaultViewSelect" class="settings-select">
            <option value="epg" ${state.defaultView === "epg" ? "selected" : ""}>TV Guide (EPG Grid)</option>
            <option value="now-next" ${state.defaultView === "now-next" ? "selected" : ""}>Now &amp; Next</option>
            <option value="what-to-watch" ${state.defaultView === "what-to-watch" ? "selected" : ""}>What to Watch</option>
            <option value="streaming" ${state.defaultView === "streaming" ? "selected" : ""}>Streaming Catalogue</option>
            <option value="live-feeds" ${state.defaultView === "live-feeds" ? "selected" : ""}>What's New</option>
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>EPG Grid Row Density</strong>
            <span>Switch to Compact rows to fit more channels at once (great on mobile &amp; landscape).</span>
          </div>
          <select id="settingDensitySelect" class="settings-select">
            <option value="comfortable" ${state.epgDensity === "comfortable" ? "selected" : ""}>Comfortable (Default)</option>
            <option value="compact" ${state.epgDensity === "compact" ? "selected" : ""}>Compact (More Channels Visible)</option>
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>EPG Timeline Horizontal Zoom</strong>
            <span>Widen programme blocks to read short 15–30 min shows easily, or narrow to see more hours.</span>
          </div>
          <select id="settingZoomSelect" class="settings-select">
            <option value="3" ${Number(state.epgZoom) === 3 ? "selected" : ""}>Compact (More hours visible)</option>
            <option value="4" ${Number(state.epgZoom) === 4 ? "selected" : ""}>Standard (Default)</option>
            <option value="6" ${Number(state.epgZoom) === 6 ? "selected" : ""}>Expanded (Wider programme blocks)</option>
          </select>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Hover Over Reveals Full Name (Desktop Only)</strong>
            <span>Expands truncated programme &amp; channel titles on mouse hover in the TV Guide (automatically disabled on mobile &amp; touch screens).</span>
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">
            <input id="settingHoverRevealToggle" type="checkbox" ${state.hoverRevealNames ? "checked" : ""} />
            ${state.hoverRevealNames ? "Enabled" : "Off"}
          </label>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Hide Teleshopping &amp; Paid Programming</strong>
            <span>Automatically hides overnight Teleshopping / Shop on TV blocks in the EPG grid.</span>
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">
            <input id="settingHideTeleToggle" type="checkbox" ${state.hideTeleshopping ? "checked" : ""} />
            ${state.hideTeleshopping ? "Hidden" : "Shown"}
          </label>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Programme Reminder Lead Time</strong>
            <span>How many minutes before broadcast to trigger browser &amp; in-app notifications.</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select id="settingReminderLeadSelect" class="settings-select">
              <option value="5" ${Number(state.reminderLeadMins) === 5 ? "selected" : ""}>5 minutes before</option>
              <option value="10" ${Number(state.reminderLeadMins) === 10 ? "selected" : ""}>10 minutes before (Default)</option>
              <option value="15" ${Number(state.reminderLeadMins) === 15 ? "selected" : ""}>15 minutes before</option>
              <option value="30" ${Number(state.reminderLeadMins) === 30 ? "selected" : ""}>30 minutes before</option>
            </select>
            <button id="testReminderAlertBtn" class="btn-secondary" type="button" style="padding:6px 12px;">🔔 Test Alert</button>
          </div>
        </div>

        <div class="settings-actions">
          <button id="openHelpGuideFromSettingsBtn" class="btn-primary" type="button">📖 Open Interactive Help &amp; User Guide</button>
          <button id="rerunSetupWizardBtn" class="btn-secondary" type="button">Re-run Setup Wizard</button>
          <button id="reinitAppBtn" class="btn-danger-outline" type="button">Reset &amp; Re-initialise Setup</button>
        </div>
      </div>

      <div class="settings-card">
        <h2>Data Saver &amp; Anti-Burst Sync Controls</h2>
        <p class="settings-card-desc">
          Minimises external API pulls using polite batching (2 chunks at a time), request deduplication, 429/503 cooldowns, and local caching.
        </p>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Low-Data Mode</strong>
            <span>Extends EPG cache to 2 hours and disables background auto-refresh polling (on-demand only).</span>
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">
            <input id="settingLowDataToggle" type="checkbox" ${state.lowDataMode ? "checked" : ""} />
            ${state.lowDataMode ? "Enabled (2h cache)" : "Off"}
          </label>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Debug Mode (Data Pull Inspector)</strong>
            <span>Shows a live floating console with API requests, latencies, cache hits, fallbacks, and 429 cooldowns.</span>
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;">
            <input id="settingDebugModeToggle" type="checkbox" ${state.debugMode ? "checked" : ""} />
            ${state.debugMode ? "Enabled" : "Off"}
          </label>
        </div>

        <div class="settings-row" style="flex-wrap:wrap; gap:10px;">
          <div class="settings-row-label">
            <strong>Custom CORS Relay URL (GitHub Pages)</strong>
            <span>Optional private Cloudflare Worker prefix (e.g. <code>https://your-worker.workers.dev/?url=</code>) to bypass public 429 limits for BBC Genome, tv24, Pluto &amp; Tubi.</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; width:100%; max-width:420px; flex-wrap:wrap;">
            <input id="settingCustomProxyInput" type="url" class="settings-select" style="flex:1; min-width:0; width:100%;" placeholder="https://your-worker.workers.dev/?url=" value="${escapeHtml(localStorage.getItem("onair_custom_proxy") || "")}" />
            <button id="settingSaveProxyBtn" class="btn-secondary" type="button" style="padding:6px 12px; flex-shrink:0;">Save</button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Live Schedule Auto-Refresh</strong>
            <span>Only refreshes live schedules when Low-Data Mode is off (never re-fetches stored Show Vault links).</span>
          </div>
          <select id="settingRefreshSelect" class="settings-select" ${state.lowDataMode ? "disabled" : ""}>
            <option value="15" ${state.refreshMins === 15 ? "selected" : ""}>Every 15 minutes</option>
            <option value="30" ${state.refreshMins === 30 ? "selected" : ""}>Every 30 minutes (Recommended)</option>
            <option value="60" ${state.refreshMins === 60 ? "selected" : ""}>Every 60 minutes</option>
            <option value="120" ${state.refreshMins === 120 ? "selected" : ""}>Every 2 hours</option>
            <option value="0" ${state.refreshMins === 0 ? "selected" : ""}>Manual only</option>
          </select>
        </div>

        <div class="settings-actions">
          <button id="settingRefreshNowBtn" class="btn-primary" type="button">Refresh Live EPG Now</button>
          <button id="clearEpgCacheBtn" class="btn-danger-outline" type="button">Clear EPG Cache (Keep Vault)</button>
        </div>
      </div>

      <div class="settings-card">
        <h2>Show Vault, Local &amp; GitHub Backups</h2>
        <p class="settings-card-desc">
          Pre-stored shows, IMDb/RT scores, and direct links live in <code>vault_data.js</code> in your repo/folder, while <code>fast_epg_snapshot.js</code> backs up Pluto TV &amp; Tubi schedules.
        </p>

        <div class="storage-stat-grid">
          <div class="storage-stat-box">
            <div class="storage-stat-val">${report.mergedShowsCount} <span style="font-size:13px; font-weight:500; color:var(--text-muted);">/ 25,000</span></div>
            <div class="storage-stat-lbl">Total Cached Shows &amp; Links</div>
          </div>
          <div class="storage-stat-box">
            <div class="storage-stat-val">${report.repoStreamingCount}</div>
            <div class="storage-stat-lbl">Folder Vault Streaming Items</div>
          </div>
          <div class="storage-stat-box">
            <div class="storage-stat-val">${report.epgDaysCached}</div>
            <div class="storage-stat-lbl">EPG Days Cached Locally</div>
          </div>
          <div class="storage-stat-box">
            <div class="storage-stat-val">${report.idbCompressedKb ? `${(Number(report.idbCompressedKb) / 1024).toFixed(2)} MB` : `${(Number(report.totalStorageKb) / 1024).toFixed(2)} MB`}</div>
            <div class="storage-stat-lbl">${escapeHtml(report.storageBackend || "IndexedDB (gzip)")} Used</div>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Folder Vault &amp; Snapshot</strong>
            <span>Vault: ${updatedLabel} (${report.repoShowsCount} repo, ${report.localShowsCount} browser) &bull; Pluto/Tubi Snapshot: ${snapLabel}</span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Your Saved Items</strong>
            <span>${state.watchlist.length} in Watchlist &bull; ${state.favorites.size} Favourite channels &bull; ${state.interests.size} Interests &bull; ${state.reminders.size} Reminders</span>
          </div>
        </div>

        <div class="settings-actions">
          <button id="downloadVaultBtn" class="btn-primary" type="button">Download Updated vault_data.js</button>
          <button id="exportBackupBtn" class="btn-secondary" type="button">Export Personal Backup (.json)</button>
          <label class="btn-secondary" style="cursor:pointer;">
            Import Backup (.json)
            <input id="importBackupInput" type="file" accept=".json,application/json" style="display:none;" />
          </label>
          <button id="clearShowVaultBtn" class="btn-danger-outline" type="button">Clear Browser Show Vault</button>
        </div>
      </div>

      <div class="settings-card">
        <h2>Live Feed Health &amp; Failsafe Diagnostics</h2>
        <p class="settings-card-desc">Current status of live UK EPG sources, local proxy failsafe, and active cache window (${health.effectiveTtlMins} min TTL).</p>
        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Sky / Freeview / Virgin / BT / Freesat EPG</strong>
            <span>${health.sky.note}</span>
          </div>
          <span class="badge ${health.sky.status === "live" ? "badge-live" : "badge-now"}">${health.sky.status.toUpperCase()}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Pluto TV UK &amp; Tubi UK</strong>
            <span>Pluto: ${health.pluto.note} &bull; Tubi: ${health.tubi.note}</span>
          </div>
          <span class="badge badge-now">${snap ? "SNAPSHOT + PROXY" : "PROXY"}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Rate-Limit Protection</strong>
            <span>${health.backoffHosts.length ? `Cooldown active for: ${health.backoffHosts.join(", ")}` : "All hosts healthy (no 429/503 cooldowns)"}</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById("settingThemeSelect").onchange = (e) => {
      state.theme = e.target.value;
      applyTheme();
      showToast(`Theme set to ${state.theme}`);
    };

    document.getElementById("settingPlatformSelect").onchange = (e) => {
      state.platform = e.target.value;
      localStorage.setItem("onair_platform", state.platform);
      renderPlatformPills();
      showToast(`Default platform set to ${PLATFORMS.find((p) => p.id === state.platform).name}`);
    };

    const settingRegionEl = document.getElementById("settingRegionSelect");
    if (settingRegionEl) {
      settingRegionEl.onchange = (e) => switchRegion(e.target.value);
    }

    const settingDebugEl = document.getElementById("settingDebugModeToggle");
    if (settingDebugEl) {
      settingDebugEl.onchange = (e) => {
        state.debugMode = Boolean(e.target.checked);
        localStorage.setItem("onair_debug_mode", state.debugMode ? "1" : "0");
        renderSettings();
        if (typeof syncDebugConsoleVisibility === "function") syncDebugConsoleVisibility();
        showToast(state.debugMode ? "Debug Mode enabled — look for 🛠️ Debug at bottom-left" : "Debug Mode disabled");
      };
    }

    const saveProxyBtn = document.getElementById("settingSaveProxyBtn");
    const proxyInput = document.getElementById("settingCustomProxyInput");
    if (saveProxyBtn && proxyInput) {
      saveProxyBtn.onclick = () => {
        const val = proxyInput.value.trim();
        localStorage.setItem("onair_custom_proxy", val);
        showToast(val ? "Custom CORS relay saved" : "Custom CORS relay cleared");
      };
    }

    document.getElementById("settingSeasonSelect").onchange = (e) => {
      state.seasonOverride = e.target.value || "auto";
      localStorage.setItem("onair_season_override", state.seasonOverride);
      renderCategoryPills();
      showToast(`Seasonal spotlight set to ${state.seasonOverride === "auto" ? "Auto" : getActiveSeason().chip}`);
    };

    const defaultViewEl = document.getElementById("settingDefaultViewSelect");
    if (defaultViewEl) {
      defaultViewEl.onchange = (e) => {
        state.defaultView = e.target.value || "epg";
        localStorage.setItem("onair_default_view", state.defaultView);
        showToast("Default startup view updated");
      };
    }

    const densityEl = document.getElementById("settingDensitySelect");
    if (densityEl) {
      densityEl.onchange = (e) => {
        state.epgDensity = e.target.value || "comfortable";
        localStorage.setItem("onair_epg_density", state.epgDensity);
        if (el.epgGrid) el.epgGrid.classList.toggle("is-compact", state.epgDensity === "compact");
        if (state.view === "epg") renderEPG(false);
        window.scrollTo({ left: 0, behavior: "instant" });
        showToast(`EPG row density set to ${state.epgDensity === "compact" ? "Compact" : "Comfortable"}`);
      };
    }

    const zoomEl = document.getElementById("settingZoomSelect");
    if (zoomEl) {
      zoomEl.onchange = (e) => {
        state.epgZoom = Number(e.target.value || 4);
        PIXELS_PER_MIN = state.epgZoom;
        localStorage.setItem("onair_epg_zoom", String(state.epgZoom));
        if (state.view === "epg") renderEPG(false);
        window.scrollTo({ left: 0, behavior: "instant" });
        showToast("EPG timeline zoom updated");
      };
    }

    const hoverRevealEl = document.getElementById("settingHoverRevealToggle");
    if (hoverRevealEl) {
      hoverRevealEl.onchange = (e) => {
        state.hoverRevealNames = Boolean(e.target.checked);
        localStorage.setItem("onair_hover_reveal", state.hoverRevealNames ? "1" : "0");
        document.body.classList.toggle("hover-reveal-enabled", state.hoverRevealNames);
        renderSettings();
        showToast(state.hoverRevealNames ? "Desktop hover-to-reveal full names enabled" : "Desktop hover-to-reveal disabled");
      };
    }

    const hideTeleEl = document.getElementById("settingHideTeleToggle");
    if (hideTeleEl) {
      hideTeleEl.onchange = (e) => {
        state.hideTeleshopping = Boolean(e.target.checked);
        localStorage.setItem("onair_hide_teleshopping", state.hideTeleshopping ? "1" : "0");
        if (state.view === "epg") renderEPG(false);
        renderSettings();
        window.scrollTo({ left: 0, behavior: "instant" });
        showToast(state.hideTeleshopping ? "Overnight Teleshopping blocks hidden" : "Teleshopping blocks shown");
      };
    }

    const reminderLeadEl = document.getElementById("settingReminderLeadSelect");
    if (reminderLeadEl) {
      reminderLeadEl.onchange = (e) => {
        state.reminderLeadMins = Number(e.target.value || 10);
        localStorage.setItem("onair_reminder_lead", String(state.reminderLeadMins));
        showToast(`Reminder alert lead time set to ${state.reminderLeadMins} minutes`);
      };
    }

    const testAlertBtn = document.getElementById("testReminderAlertBtn");
    if (testAlertBtn) {
      testAlertBtn.onclick = async () => {
        if ("Notification" in window && Notification.permission === "default") {
          try {
            await Notification.requestPermission();
          } catch (_) {}
        }
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("OnAir UK • Reminder Test", {
              body: `Alerts will fire ${state.reminderLeadMins} minutes before your saved programmes start.`
            });
          } catch (_) {}
        }
        showToast(`🔔 Test Alert: Notifications active (${state.reminderLeadMins}m before start)`);
      };
    }

    const helpFromSettingsBtn = document.getElementById("openHelpGuideFromSettingsBtn");
    if (helpFromSettingsBtn) {
      helpFromSettingsBtn.onclick = () => openHelpGuideModal();
    }

    document.getElementById("settingLowDataToggle").onchange = (e) => {
      state.lowDataMode = Boolean(e.target.checked);
      localStorage.setItem("onair_low_data", state.lowDataMode ? "1" : "0");
      scheduleAutoRefresh();
      renderSettings();
      showToast(state.lowDataMode ? "Low-Data Mode enabled (2h cache, no background polling)" : "Low-Data Mode disabled");
    };

    document.getElementById("settingRefreshSelect").onchange = (e) => {
      state.refreshMins = Number(e.target.value);
      localStorage.setItem("onair_refresh_mins", String(state.refreshMins));
      scheduleAutoRefresh();
      showToast(state.refreshMins > 0 ? `Live EPG auto-refresh set to ${state.refreshMins} mins` : "Live EPG set to manual refresh");
    };

    document.getElementById("settingRefreshNowBtn").onclick = () => {
      const elapsed = Date.now() - lastManualRefreshTs;
      if (elapsed < 30 * 1000) {
        const waitSec = Math.ceil((30 * 1000 - elapsed) / 1000);
        showToast(`Please wait ${waitSec}s before refreshing again (anti-burst cooldown)`);
        return;
      }
      lastManualRefreshTs = Date.now();
      refreshLiveScheduleOnly().then(() => {
        showToast("Live TV schedules refreshed");
        renderSettings();
      });
    };

    document.getElementById("rerunSetupWizardBtn").onclick = () => {
      openOnboardingWizard(1);
    };

    document.getElementById("reinitAppBtn").onclick = () => {
      localStorage.removeItem("onair_onboarded_v1");
      localStorage.removeItem("onair_platform");
      localStorage.removeItem("onair_interests");
      localStorage.removeItem("onair_favorites");
      localStorage.removeItem("onair_watchlist");
      localStorage.removeItem("onair_reminders");
      state.platform = "freeview";
      state.interests = new Set();
      state.favorites = new Set();
      state.watchlist = [];
      state.reminders = new Set();
      renderPlatformPills();
      renderWatchlist();
      renderSettings();
      openOnboardingWizard(1);
    };

    document.getElementById("downloadVaultBtn").onclick = () => {
      if (!ONAIR_LIVE.buildExportVaultJs) return;
      downloadTextFile("vault_data.js", ONAIR_LIVE.buildExportVaultJs(), "application/javascript;charset=utf-8");
      showToast("Downloaded vault_data.js — drop it in your project folder for GitHub");
    };

    document.getElementById("exportBackupBtn").onclick = () => {
      const backup = {
        exportedAt: new Date().toISOString(),
        platform: state.platform,
        theme: state.theme,
        refreshMins: state.refreshMins,
        watchlist: state.watchlist,
        favorites: [...state.favorites],
        interests: [...state.interests],
        reminders: [...state.reminders]
      };
      downloadTextFile("onair-uk-backup.json", JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
      showToast("Personal backup exported");
    };

    document.getElementById("importBackupInput").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (Array.isArray(data.watchlist)) {
            state.watchlist = data.watchlist;
            localStorage.setItem("onair_watchlist", JSON.stringify(state.watchlist));
          }
          if (Array.isArray(data.favorites)) {
            state.favorites = new Set(data.favorites);
            localStorage.setItem("onair_favorites", JSON.stringify([...state.favorites]));
          }
          if (Array.isArray(data.interests)) {
            state.interests = new Set(data.interests);
            localStorage.setItem("onair_interests", JSON.stringify([...state.interests]));
          }
          if (Array.isArray(data.reminders)) {
            state.reminders = new Set(data.reminders);
            localStorage.setItem("onair_reminders", JSON.stringify([...state.reminders]));
          }
          if (data.platform) {
            state.platform = data.platform;
            localStorage.setItem("onair_platform", state.platform);
          }
          if (data.theme) {
            state.theme = data.theme;
            applyTheme();
          }
          renderWatchlist();
          renderPlatformPills();
          renderSettings();
          showToast("Backup restored successfully");
        } catch {
          showToast("Invalid backup JSON file");
        }
      };
      reader.readAsText(file);
    };

    document.getElementById("clearEpgCacheBtn").onclick = () => {
      if (ONAIR_LIVE.clearEpgCache) ONAIR_LIVE.clearEpgCache();
      liveEpgByDay.clear();
      renderSettings();
      showToast("Browser EPG cache cleared");
    };

    document.getElementById("clearShowVaultBtn").onclick = () => {
      if (ONAIR_LIVE.clearShowVault) ONAIR_LIVE.clearShowVault();
      renderSettings();
      showToast("Browser show vault cleared (folder vault_data.js remains intact)");
    };
  }

  // ========================================================================
  // First-Time Setup Wizard (Platform required; Genres & Shows skippable)
  // ========================================================================
  function finishOnboarding() {
    localStorage.setItem("onair_onboarded_v1", "true");
    if (el.onboardingModal) el.onboardingModal.classList.add("hidden");
    renderPlatformPills();
    renderWatchlist();
    if (state.view === "epg") renderEPG();
    else if (state.view === "now-next") renderNowNext();
    else if (state.view === "what-to-watch") renderWhatToWatch();
    else if (state.view === "streaming") renderStreaming();
    showToast("Setup complete — enjoy OnAir UK");
  }

  function openOnboardingWizard(startStep = 1) {
    if (!el.onboardingModal || !el.onboardingBody) return;
    if (!localStorage.getItem("onair_onboarded_v1") && startStep === 1) {
      state.interests.clear();
      localStorage.setItem("onair_interests", "[]");
    }
    let step = startStep;
    let chosenPlatform = localStorage.getItem("onair_platform") || state.platform || "freeview";
    const platformDesc = {
      freeview: "Aerial / Freeview Play",
      sky: "Sky Q / Sky Stream / Glass",
      virgin: "Virgin Media TV",
      bt: "BT / EE TV",
      freesat: "Freesat Satellite"
    };

    function renderStep() {
      const dots = [1, 2, 3]
        .map((n) => `<div class="onboard-step-dot ${n === step ? "is-active" : n < step ? "is-done" : ""}"></div>`)
        .join("");

      if (step === 1) {
        el.onboardingBody.innerHTML = `
          <div class="onboard-steps">${dots}</div>
          <div class="modal-kicker"><span class="mini-tag">Step 1 of 3 &bull; Required</span></div>
          <h2 id="onboardTitle" class="modal-title">Welcome to OnAir UK</h2>
          <p class="modal-synopsis" style="margin-bottom:8px;">Which TV platform are you watching on? This sets your channel numbers and lineups.</p>
          <div class="onboard-platform-grid">
            ${PLATFORMS.map(
              (p) => `
              <button class="onboard-choice-card ${chosenPlatform === p.id ? "is-selected" : ""}" data-ob-platform="${p.id}" type="button">
                <strong>${p.name}</strong>
                <span>${platformDesc[p.id] || "UK TV"}</span>
              </button>
            `
            ).join("")}
          </div>
          <div style="margin-top:12px;">
            <label for="obRegionSelect" style="display:block; font-size:12px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">TV Region (UK &amp; Ireland)</label>
            <select id="obRegionSelect" class="settings-select" style="width:100%;">
              ${(ONAIR_LIVE.REGIONS || []).map((r) => `<option value="${r.id}" ${ONAIR_LIVE.getRegion && ONAIR_LIVE.getRegion().id === r.id ? "selected" : ""}>${r.name}</option>`).join("")}
            </select>
          </div>
          <div class="onboard-footer">
            <span style="font-size:12px; color:var(--text-muted);">You can change this anytime in Settings or the top bar.</span>
            <div class="onboard-footer-right">
              <button id="obNextBtn" class="btn-primary" type="button">Next: Genres &rarr;</button>
            </div>
          </div>
        `;

        el.onboardingBody.querySelectorAll("[data-ob-platform]").forEach((btn) => {
          btn.onclick = () => {
            chosenPlatform = btn.dataset.obPlatform;
            state.platform = chosenPlatform;
            localStorage.setItem("onair_platform", chosenPlatform);
            renderStep();
          };
        });
        const obRegionEl = document.getElementById("obRegionSelect");
        if (obRegionEl) {
          obRegionEl.onchange = (e) => switchRegion(e.target.value);
        }
        document.getElementById("obNextBtn").onclick = () => {
          state.platform = chosenPlatform;
          localStorage.setItem("onair_platform", chosenPlatform);
          step = 2;
          renderStep();
        };
      } else if (step === 2) {
        el.onboardingBody.innerHTML = `
          <div class="onboard-steps">${dots}</div>
          <div class="modal-kicker"><span class="mini-tag">Step 2 of 3 &bull; Optional</span></div>
          <h2 id="onboardTitle" class="modal-title">What genres &amp; topics do you like?</h2>
          <p class="modal-synopsis" style="margin-bottom:4px;">Pick any you enjoy to personalise <strong>What to Watch</strong>, or skip this step.</p>
          <div class="onboard-chips">
            ${INTEREST_CATEGORIES.map(
              (tag) => `
              <button class="pill-btn ${state.interests.has(tag) ? "is-active" : ""}" data-ob-interest="${tag}" type="button">${tag}</button>
            `
            ).join("")}
          </div>
          <div class="onboard-footer">
            <button id="obBackBtn" class="btn-secondary" type="button">&larr; Back</button>
            <div class="onboard-footer-right">
              <button id="obSkipBtn" class="ghost-btn" style="color:var(--text-secondary); border-color:var(--border-subtle);" type="button">Skip</button>
              <button id="obNextBtn" class="btn-primary" type="button">Next: Shows &amp; Channels &rarr;</button>
            </div>
          </div>
        `;

        el.onboardingBody.querySelectorAll("[data-ob-interest]").forEach((btn) => {
          btn.onclick = () => {
            const tag = btn.dataset.obInterest;
            if (state.interests.has(tag)) state.interests.delete(tag);
            else state.interests.add(tag);
            localStorage.setItem("onair_interests", JSON.stringify([...state.interests]));
            renderStep();
          };
        });
        document.getElementById("obBackBtn").onclick = () => {
          step = 1;
          renderStep();
        };
        document.getElementById("obSkipBtn").onclick = () => finishOnboarding();
        document.getElementById("obNextBtn").onclick = () => {
          step = 3;
          renderStep();
        };
      } else {
        const starterChannels = getFilteredChannels("All").slice(0, 10);
        const starterShows = getMergedCatalogue().slice(0, 8);
        el.onboardingBody.innerHTML = `
          <div class="onboard-steps">${dots}</div>
          <div class="modal-kicker"><span class="mini-tag">Step 3 of 3 &bull; Optional</span></div>
          <h2 id="onboardTitle" class="modal-title">Pick favourite channels &amp; shows</h2>
          <p class="modal-synopsis" style="margin-bottom:4px;">Star channels for quick filtering or save shows to your Watchlist — or skip straight to the guide.</p>

          <div class="onboard-subhead">Popular Channels on ${PLATFORMS.find((p) => p.id === state.platform)?.name || "Your Platform"}</div>
          <div class="onboard-chips">
            ${starterChannels
              .map(
                (ch) => `
              <button class="pill-btn ${state.favorites.has(ch.id) ? "is-active" : ""}" data-ob-fav="${ch.id}" type="button">&#9733; ${ch.numbers[state.platform]} ${ch.name}</button>
            `
              )
              .join("")}
          </div>

          <div class="onboard-subhead">Popular Shows &amp; Films to Watchlist</div>
          <div class="onboard-chips">
            ${starterShows
              .map(
                (s) => `
              <button class="pill-btn ${isInWatchlist(s.id) ? "is-active" : ""}" data-ob-show="${s.id}" type="button">${isInWatchlist(s.id) ? "✓ " : "+ "}${s.title}</button>
            `
              )
              .join("")}
          </div>

          <div class="onboard-footer">
            <button id="obBackBtn" class="btn-secondary" type="button">&larr; Back</button>
            <div class="onboard-footer-right">
              <button id="obSkipBtn" class="ghost-btn" style="color:var(--text-secondary); border-color:var(--border-subtle);" type="button">Skip &amp; Finish</button>
              <button id="obFinishBtn" class="btn-primary" type="button">Save &amp; Start Watching</button>
            </div>
          </div>
        `;

        el.onboardingBody.querySelectorAll("[data-ob-fav]").forEach((btn) => {
          btn.onclick = () => {
            const chId = btn.dataset.obFav;
            if (state.favorites.has(chId)) state.favorites.delete(chId);
            else state.favorites.add(chId);
            localStorage.setItem("onair_favorites", JSON.stringify([...state.favorites]));
            renderStep();
          };
        });
        el.onboardingBody.querySelectorAll("[data-ob-show]").forEach((btn) => {
          btn.onclick = () => {
            const s = starterShows.find((item) => item.id === btn.dataset.obShow);
            if (s) {
              toggleWatchlist({ id: s.id, kind: "stream", title: s.title, subtitle: `${s.platform} • ${s.type}` });
              renderStep();
            }
          };
        });
        document.getElementById("obBackBtn").onclick = () => {
          step = 2;
          renderStep();
        };
        document.getElementById("obSkipBtn").onclick = () => finishOnboarding();
        document.getElementById("obFinishBtn").onclick = () => finishOnboarding();
      }
    }

    renderStep();
    el.onboardingModal.classList.remove("hidden");
  }

  // ========================================================================
  // OnAir Assistant Chat Bot (Smart Navigation + When On Next)
  // ========================================================================
  function initChatBot() {
    const fab = document.getElementById("chatFab");
    const panel = document.getElementById("chatPanel");
    const closeBtn = document.getElementById("closeChatBtn");
    const messagesEl = document.getElementById("chatMessages");
    const quickEl = document.getElementById("chatQuickPrompts");
    const form = document.getElementById("chatForm");
    const input = document.getElementById("chatInput");
    if (!fab || !panel || !messagesEl || !form || !input) return;

    let lastTopic = null;
    let lastMatches = null;
    let lastQueryContext = null;

    function addMsg(role, text, actions = []) {
      const div = document.createElement("div");
      div.className = `chat-msg ${role}`;
      div.innerHTML = text;
      const closeChatOnMobile = () => {
        if (window.innerWidth <= 820 || window.innerHeight <= 540) {
          panel.classList.add("hidden");
        }
      };
      div.querySelectorAll("[data-chat-open-prog]").forEach((link) => {
        link.addEventListener("click", (ev) => {
          ev.preventDefault();
          closeChatOnMobile();
          openProgrammeModal(link.dataset.chatOpenProg, link.dataset.chatOpenCh);
        });
      });
      div.querySelectorAll("[data-chat-open-stream]").forEach((link) => {
        link.addEventListener("click", (ev) => {
          ev.preventDefault();
          closeChatOnMobile();
          openStreamModal(link.dataset.chatOpenStream);
        });
      });
      div.querySelectorAll("[data-chat-jump-ch]").forEach((link) => {
        link.addEventListener("click", (ev) => {
          ev.preventDefault();
          closeChatOnMobile();
          jumpToGuideMatch(link.dataset.chatJumpCh, Number(link.dataset.chatJumpDay || 0), Number(link.dataset.chatJumpMin || 0));
        });
      });
      if (actions.length) {
        const actRow = document.createElement("div");
        actRow.className = "chat-msg-actions";
        actions.forEach((a) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chat-action-btn";
          btn.textContent = a.label;
          btn.onclick = a.onClick;
          actRow.appendChild(btn);
        });
        div.appendChild(actRow);
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function parseChatTimeContext(lower) {
      let dayOffset = 0;
      if (/\byesterday\b/i.test(lower)) dayOffset = -1;
      else if (/\btomorrow\b/i.test(lower)) dayOffset = 1;

      if (/\b(this evening|tonight|primetime|evening)\b/i.test(lower)) {
        return { mode: "evening", minMin: 18 * 60, maxMin: 24 * 60, dayOffset, label: dayOffset === 1 ? "Tomorrow Evening (18:00–24:00)" : "This Evening (18:00–24:00)" };
      }
      if (/\b(this afternoon|afternoon)\b/i.test(lower)) {
        return { mode: "afternoon", minMin: 12 * 60, maxMin: 18 * 60, dayOffset, label: dayOffset === 1 ? "Tomorrow Afternoon (12:00–18:00)" : "This Afternoon (12:00–18:00)" };
      }
      if (/\b(this morning|morning)\b/i.test(lower)) {
        return { mode: "morning", minMin: 6 * 60, maxMin: 12 * 60, dayOffset, label: dayOffset === 1 ? "Tomorrow Morning (06:00–12:00)" : "This Morning (06:00–12:00)" };
      }
      if (/\b(late night|late|overnight|midnight)\b/i.test(lower)) {
        return { mode: "late", minMin: 22 * 60, maxMin: 24 * 60, dayOffset, label: "Late Night (22:00–00:00)" };
      }
      if (dayOffset !== 0) {
        return { mode: "allday", minMin: 0, maxMin: 24 * 60, dayOffset, label: getDayLabelShort(dayOffset) };
      }
      return { mode: "now", minMin: null, maxMin: null, dayOffset: 0, label: "Right Now" };
    }

    function getSmartPicks({ regex = null, catId = null, platId = null, onlyFilms = false, timeCtx = null, limit = 5 } = {}) {
      const nowMin = getNowMinutes();
      const tCtx = timeCtx || { mode: "now", minMin: null, maxMin: null, dayOffset: 0, label: "Right Now" };
      const dayOffset = tCtx.dayOffset || 0;
      const localCache = getCachedStoreForSearch();
      const targetPlat = platId || state.platform;
      const chs = platId
        ? liveChannels.filter((c) => c.numbers[platId] != null)
        : [
            ...liveChannels.filter((c) => c.numbers[targetPlat] != null),
            ...liveChannels.filter((c) => c.numbers[targetPlat] == null)
          ];
      const skipRe = /\b(teleshopping|programmes start at|this is bbc|shop on tv|must have ideas|ideal world|high street - shopping|unwind with itv|alba today)\b/i;
      const allMatches = [];
      const seenTitles = new Set();

      for (const ch of chs) {
        const progs = getDayScheduleForSearch(ch, dayOffset, localCache);
        if (!Array.isArray(progs) || !progs.length) continue;
        for (const p of progs) {
          if (!p || !p.title || skipRe.test(p.title)) continue;
          if (dayOffset === 0 && tCtx.mode === "now" && p.endMin <= nowMin) continue;
          const isFilm = p.genre === "Film" || /^film:/i.test(p.title) || /\b(film4|talkingpictures|moviesphere|curzon|screen classics|lifetime movies|pluto tv (movies|cult|thrillers|westerns)|sky (premiere|greats|family|action|thriller|drama|christmas|scfi))\b/i.test(ch.name);
          if (onlyFilms && !isFilm) continue;
          const hay = `${p.title} ${p.desc || ""} ${p.genre || ""} ${ch.name}`;
          if (regex && !regex.test(hay)) continue;
          if (!regex && catId && catId !== "All" && !progMatchesCategory(p, catId, ch.name)) continue;

          const isOnNow = dayOffset === 0 && nowMin >= p.startMin && nowMin < p.endMin;
          const isStartingSoon = dayOffset === 0 && p.startMin > nowMin && p.startMin <= nowMin + 90;
          const inWindow =
            tCtx.mode === "now"
              ? isOnNow || isStartingSoon
              : tCtx.mode === "allday"
                ? true
                : p.startMin < tCtx.maxMin && p.endMin > tCtx.minMin && p.startMin >= tCtx.minMin - 30;

          let score = 0;
          if (tCtx.mode === "now") {
            if (isOnNow) score += 80;
            else if (isStartingSoon) score += 45;
            else score += Math.max(0, 20 - Math.floor((p.startMin - nowMin) / 60));
          } else if (inWindow) {
            score += 65;
            if (p.startMin >= 20 * 60 && p.startMin <= 22 * 60) score += 15;
          }
          if (cHasPlatform(ch, targetPlat)) score += 15;
          if (p.isNew || /^New:/i.test(p.title)) score += 12;
          if (isFilm && onlyFilms) score += 15;

          allMatches.push({ ch, prog: p, dayOffset, isOnNow, inWindow, score });
        }
      }

      allMatches.sort((a, b) => Number(b.inWindow) - Number(a.inWindow) || b.score - a.score || a.prog.startMin - b.prog.startMin);
      const dedupedTv = [];
      let fallbackLater = false;
      for (const item of allMatches) {
        if (tCtx.mode !== "allday" && !item.inWindow && dedupedTv.some((d) => d.inWindow)) continue;
        const cleanKey = item.prog.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seenTitles.has(cleanKey)) continue;
        seenTitles.add(cleanKey);
        if (!item.inWindow) fallbackLater = true;
        dedupedTv.push(item);
        if (dedupedTv.length >= limit) break;
      }

      const streamCandidates = [];
      getMergedCatalogue().forEach((item) => {
        if (onlyFilms && item.type !== "Films") return;
        const hay = `${item.title} ${item.desc || ""} ${item.genre || ""} ${item.type || ""} ${(item.interests || []).join(" ")}`;
        if (regex && !regex.test(hay)) return;
        if (!regex && catId && catId !== "All" && catId !== "Film" && item.genre !== catId) return;
        const cleanKey = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seenTitles.has(cleanKey)) return;
        seenTitles.add(cleanKey);
        streamCandidates.push(item);
      });

      return {
        tv: dedupedTv,
        stream: streamCandidates.slice(0, 3),
        fallbackLater,
        timeCtx: tCtx
      };
    }

    function cHasPlatform(ch, platId) {
      return Boolean(ch && ch.numbers && ch.numbers[platId] != null);
    }

    function formatPickLine(x) {
      const tag = x.isOnNow ? `<span style="color:#ef4444;font-weight:700;">LIVE NOW</span>` : formatTime(x.prog.startMin);
      return `&bull; <strong>${escapeHtml(x.ch.name)}</strong>: <a href="#" data-chat-open-prog="${escapeHtml(x.prog.id)}" data-chat-open-ch="${escapeHtml(x.ch.id)}" style="color:var(--accent);font-weight:700;text-decoration:underline;">${escapeHtml(x.prog.title)}</a> (${tag}) <a href="#" data-chat-jump-ch="${escapeHtml(x.ch.id)}" data-chat-jump-day="${x.dayOffset}" data-chat-jump-min="${x.prog.startMin}" style="font-size:11px;color:var(--text-muted);text-decoration:none;margin-left:4px;">[Guide &nearr;]</a>`;
    }

    function formatStreamLine(s) {
      return `&bull; <strong>${escapeHtml(s.platform)}</strong>: <a href="#" data-chat-open-stream="${escapeHtml(s.id)}" style="color:var(--accent);font-weight:700;text-decoration:underline;">${escapeHtml(s.title)}</a> (${formatStars(s.rating)})`;
    }

    async function handleQuery(raw) {
      const q = raw.trim();
      if (!q) return;
      addMsg("user", escapeHtml(q));
      const lower = q.toLowerCase();

      // Help command
      if (/^(help|\?|what can you do|commands)$/i.test(lower)) {
        addMsg(
          "bot",
          "Here's what I can do:<br/>" +
          "&bull; <strong>When is [show] on next?</strong> (searches -7d to +6d + streaming + TVMaze)<br/>" +
          "&bull; <strong>Open [Platform/View]</strong> (Sky, Freeview, Pluto TV, Tubi, What to Watch, Settings)<br/>" +
          "&bull; <strong>What's on [Sport/Christmas/Film] tonight?</strong> (lists live picks &amp; filters)<br/>" +
          "&bull; <strong>Theme &amp; Data:</strong> <em>\"Dark mode\"</em>, <em>\"Low data mode\"</em>, <em>\"Surprise me\"</em>, <em>\"My watchlist\"</em>"
        );
        return;
      }

      // Theme / Low-Data / Watchlist commands
      if (/\b(dark mode|night mode|dark theme)\b/i.test(lower)) {
        state.theme = "dark";
        applyTheme();
        addMsg("bot", "Switched to <strong>Dark Mode</strong>.");
        return;
      }
      if (/\b(light mode|day mode|light theme)\b/i.test(lower)) {
        state.theme = "light";
        applyTheme();
        addMsg("bot", "Switched to <strong>Light Mode</strong>.");
        return;
      }
      if (/\b(low data|data saver|save data)\b/i.test(lower)) {
        state.lowDataMode = !/\boff|disable\b/i.test(lower);
        localStorage.setItem("onair_low_data", state.lowDataMode ? "1" : "0");
        scheduleAutoRefresh();
        addMsg("bot", `Low-Data Mode is now <strong>${state.lowDataMode ? "Enabled (2h cache, no background polling)" : "Disabled"}</strong>.`, [
          { label: "Open Settings", onClick: () => switchView("settings") }
        ]);
        return;
      }
      if (/\b(my watchlist|open watchlist|show watchlist)\b/i.test(lower)) {
        renderWatchlist();
        if (el.watchlistDrawer) el.watchlistDrawer.classList.remove("hidden");
        addMsg("bot", `Opened your Watchlist (${state.watchlist.length} saved item${state.watchlist.length === 1 ? "" : "s"}).`);
        return;
      }
      if (/\b(surprise me|pick something|random pick)\b/i.test(lower)) {
        const cat = getMergedCatalogue().filter((s) => Number(s.rating || 0) >= 4.2);
        const pick = cat[Math.floor(Math.random() * cat.length)] || getMergedCatalogue()[0];
        if (pick) {
          lastTopic = pick.title;
          addMsg("bot", `How about <strong>${escapeHtml(pick.title)}</strong> (${escapeHtml(pick.platform)} · ${escapeHtml(pick.genre)})?<br/>${escapeHtml((pick.desc || "").slice(0, 120))}...`, [
            { label: "Open Details", onClick: () => openStreamModal(pick.id) },
            { label: "+ Watchlist", onClick: () => { toggleWatchlist({ id: pick.id, title: pick.title, meta: pick.platform }); renderWatchlist(); showToast("Watchlist updated"); } }
          ]);
          return;
        }
      }

      // Follow-up commands using conversational memory
      if (lastMatches && /\b(add to watchlist|save it|save this|bookmark)\b/i.test(lower)) {
        const first = (lastMatches.tvMatches && lastMatches.tvMatches[0]) || null;
        const firstStream = (lastMatches.streamMatches && lastMatches.streamMatches[0]) || null;
        if (first) {
          toggleWatchlist({ id: first.prog.id, title: first.prog.title, meta: first.channel.name });
          renderWatchlist();
          addMsg("bot", `Added <strong>${escapeHtml(first.prog.title)}</strong> to your Watchlist.`);
          return;
        }
        if (firstStream) {
          toggleWatchlist({ id: firstStream.id, title: firstStream.title, meta: firstStream.platform });
          renderWatchlist();
          addMsg("bot", `Added <strong>${escapeHtml(firstStream.title)}</strong> to your Watchlist.`);
          return;
        }
      }
      if (lastTopic && /\b(yesterday|last week|past|earlier)\b/i.test(lower) && lastTopic.length >= 2) {
        const res = searchAcrossDays(lastTopic, false);
        const past = res.tvMatches.filter((m) => m.status === "past").slice(0, 3);
        if (past.length) {
          addMsg(
            "bot",
            `Recent airings of <strong>${escapeHtml(lastTopic)}</strong>:<br/>` +
            past.map((p) => `&bull; ${p.whenLabel} on <strong>${escapeHtml(p.channel.name)}</strong>`).join("<br/>"),
            [{ label: `Jump to ${past[0].channel.name}`, onClick: () => jumpToGuideMatch(past[0].channel.id, past[0].dayOffset, past[0].prog.startMin) }]
          );
          return;
        }
      }

      // 1. Detect platform intent
      const platMap = [
        { re: /\bpluto(\s+tv)?\b/i, id: "pluto", name: "Pluto TV" },
        { re: /\btubi\b/i, id: "tubi", name: "Tubi" },
        { re: /\bsky\b/i, id: "sky", name: "Sky" },
        { re: /\bfreeview\b/i, id: "freeview", name: "Freeview" },
        { re: /\bvirgin(\s+media)?\b/i, id: "virgin", name: "Virgin Media" },
        { re: /\b(bt|ee tv|ee)\b/i, id: "bt", name: "BT / EE TV" },
        { re: /\bfreesat\b/i, id: "freesat", name: "Freesat" }
      ];
      const matchedPlat = platMap.find((p) => p.re.test(lower));

      // 2. Detect time-window context clues & specific season/holiday or genre/topic intent
      const timeCtx = parseChatTimeContext(lower);
      const isTimeFollowUpOnly = /^(what about\s+|how about\s+|and\s+)?(right now|on now|now|this morning|morning|this afternoon|afternoon|this evening|evening|tonight|primetime|late|late night|tomorrow|yesterday)\??$/i.test(lower);
      if (isTimeFollowUpOnly && lastQueryContext) {
        const picks = getSmartPicks({
          ...lastQueryContext,
          timeCtx,
          limit: 5
        });
        const heading = `${lastQueryContext.label} &bull; ${timeCtx.label}`;
        const lines = [
          picks.fallbackLater && timeCtx.mode === "now"
            ? `Nothing live right this minute for <strong>${escapeHtml(lastQueryContext.label)}</strong> &mdash; here is what's coming up next today:`
            : `<strong>${escapeHtml(heading)}</strong>:`
        ];
        if (picks.tv.length) lines.push(picks.tv.map(formatPickLine).join("<br/>"));
        if (picks.stream.length) lines.push(`<strong>On-Demand Anytime:</strong><br/>` + picks.stream.map(formatStreamLine).join("<br/>"));
        addMsg("bot", lines.join("<br/><br/>"), [
          { label: "⚡ Right Now", onClick: () => handleQuery(`${lastQueryContext.rawQuery} right now`) },
          { label: "☀️ Afternoon", onClick: () => handleQuery(`${lastQueryContext.rawQuery} this afternoon`) },
          { label: "🌙 This Evening", onClick: () => handleQuery(`${lastQueryContext.rawQuery} this evening`) }
        ]);
        return;
      }

      const wantsFilmsOnly = /\b(film|films|movie|movies|cinema)\b/i.test(lower);
      const wantsTonight = timeCtx.mode === "evening";
      const explicitSeason = SEASON_CALENDAR.find((s) => new RegExp(`\\b(${s.id}|${s.searchQuery}|${s.id === "christmas" ? "xmas|festive|santa" : s.id === "halloween" ? "spooky" : s.id})\\b`, "i").test(lower));

      const topicMap = [
        {
          label: "Horror & Supernatural",
          test: /\b(horror|scary|spooky|slasher|zombie|vampire|haunted|ghost|supernatural|exorcist|conjuring|pet sematary)\b/i,
          regex: /\b(horror|scary|spooky|slasher|zombie|vampire|haunted|ghost|supernatural|exorcist|conjuring|pet sematary|evil|walking dead|charmed|buffy|frankenstein|dracula|omen|halloween|fright)\b/i,
          catId: wantsFilmsOnly ? "Film" : "Drama"
        },
        {
          label: "Sci-Fi & Fantasy",
          test: /\b(sci-?fi|science fiction|space|alien|star trek|stargate|futuristic|cyberpunk)\b/i,
          regex: /\b(sci-?fi|science fiction|star trek|stargate|doctor who|farscape|andromeda|galactica|babylon 5|dune|severance|fallout|alien|predator|matrix|terminator|interstellar|twilight zone)\b/i,
          catId: wantsFilmsOnly ? "Film" : "Drama"
        },
        {
          label: "Crime, Thriller & Mystery",
          test: /\b(thriller|crime|murder|detective|mystery|police|forensic|whodunnit)\b/i,
          regex: /\b(thriller|crime|murder|detective|mystery|police|forensic|fbi|ncis|csi|vera|shetland|midsomer|foyle|poi|jackal|slow horses|ripley|line of duty|unforgotten|silent witness|law & order|killer)\b/i,
          catId: wantsFilmsOnly ? "Film" : "Drama"
        },
        {
          label: "Comedy & Sitcoms",
          test: /\b(comedy|comedies|funny|sitcom|stand-?up|panel show|laugh)\b/i,
          regex: /\b(comedy|sitcom|funny|taskmaster|would i lie|gogglebox|big bang|friends|frasier|simpsons|partridge|porridge|only connect|cats does countdown|mock the week|qi\b|Apollo|young sheldon|office|cheers|raymond)\b/i,
          catId: "Entertainment"
        },
        {
          label: "Action & Adventure",
          test: /\b(action|western|westerns|adventure|superhero)\b/i,
          regex: /\b(action|western|expendables|fast & furious|jurassic|mission impossible|bond|lethal weapon|walker|sundown|gun|outlaw|batman|shazam|venom)\b/i,
          catId: wantsFilmsOnly ? "Film" : "Entertainment"
        }
      ];
      const matchedTopic = topicMap.find((t) => t.test.test(lower));

      // 3. Detect standard EPG category intent
      const catMap = [
        { re: /\b(sport|football|soccer|premier league|champions league|nations league|cricket|rugby|tennis|f1|formula 1|boxing|ufc|darts|nfl|golf|snooker)\b/i, id: "Sport", label: "Sport" },
        { re: /\b(film|films|movie|movies|cinema)\b/i, id: "Film", label: "Film" },
        { re: /\b(drama|soaps?)\b/i, id: "Drama", label: "Drama" },
        { re: /\b(doc|documentar(y|ies)|nature|history)\b/i, id: "Documentary", label: "Documentary" },
        { re: /\b(news|weather|politics)\b/i, id: "News", label: "News" },
        { re: /\b(kid|kids|children|cartoon)\b/i, id: "Kids", label: "Kids" },
        { re: /\b(music|concert)\b/i, id: "Music", label: "Music" },
        { re: /\b(radio)\b/i, id: "Radio", label: "Radio" },
        { re: /\b(fav|favorite|favourite)s?\b/i, id: "Favorites", label: "Favorites" }
      ];
      const matchedCat = catMap.find((c) => c.re.test(lower));

      // 4. Detect view intent
      let matchedView = null;
      if (/\b(what to watch|recommend|tonight'?s picks|picks)\b/i.test(lower)) matchedView = { id: "what-to-watch", label: "What to Watch" };
      else if (/\b(now & next|now and next|on now)\b/i.test(lower)) matchedView = { id: "now-next", label: "Now & Next" };
      else if (/\b(streaming|on demand|netflix|disney|prime)\b/i.test(lower) && !/when is|where can i/i.test(lower)) matchedView = { id: "streaming", label: "Streaming" };
      else if (/\b(what'?s new|headlines|rss)\b/i.test(lower)) matchedView = { id: "live-feeds", label: "What's New" };
      else if (/\b(settings|backup|vault|cache|diagnostics|health)\b/i.test(lower)) matchedView = { id: "settings", label: "Settings" };

      // 5. Detect day/time jump
      let dayJump = null;
      if (/\byesterday\b/i.test(lower)) dayJump = -1;
      else if (/\btomorrow\b/i.test(lower)) dayJump = 1;
      else if (/\btoday\b/i.test(lower)) dayJump = 0;

      let hourJump = null;
      if (/\b(primetime|evening|tonight)\b/i.test(lower)) hourJump = 20;
      else if (/\bmorning\b/i.test(lower)) hourJump = 8;
      else if (/\bafternoon\b/i.test(lower)) hourJump = 14;
      else if (/\blate\b/i.test(lower)) hourJump = 22;
      else if (/\b(overnight|midnight)\b/i.test(lower)) hourJump = 0;

      // 6. Handle Seasonal / Christmas / Holiday queries (e.g. "Show me Christmas movies", "Christmas movies tonight")
      if (explicitSeason) {
        const label = `${explicitSeason.chip}${wantsFilmsOnly ? " Movies" : " Picks"}`;
        lastQueryContext = { regex: explicitSeason.regex, onlyFilms: wantsFilmsOnly, label, rawQuery: `${explicitSeason.id}${wantsFilmsOnly ? " movies" : ""}` };
        const picks = getSmartPicks({
          regex: explicitSeason.regex,
          onlyFilms: wantsFilmsOnly,
          timeCtx,
          limit: 5
        });
        const lines = [
          picks.fallbackLater && timeCtx.mode === "now"
            ? `No <strong>${escapeHtml(label)}</strong> on live TV right this minute &mdash; here is what's coming up next today:`
            : `<strong>${escapeHtml(label)} &bull; ${escapeHtml(timeCtx.label)}</strong>:`
        ];
        if (picks.tv.length) {
          lines.push(picks.tv.map(formatPickLine).join("<br/>"));
        }
        if (picks.stream.length) {
          lines.push(`<strong>Stream On-Demand Now:</strong><br/>` + picks.stream.map(formatStreamLine).join("<br/>"));
        }
        const actions = [
          { label: "⚡ Right Now", onClick: () => handleQuery(`${lastQueryContext.rawQuery} right now`) },
          { label: "🌙 This Evening", onClick: () => handleQuery(`${lastQueryContext.rawQuery} this evening`) },
          { label: `Switch Guide to ${explicitSeason.chip}`, onClick: () => setGuideModeChoice(explicitSeason.id) }
        ];
        addMsg("bot", lines.join("<br/><br/>"), actions);
        return;
      }

      // 7. Handle specific Genre / Topic / Mood queries (e.g. "horror movies", "horror movies this evening", "sci-fi", "comedy tonight")
      if (matchedTopic) {
        const label = `${matchedTopic.label}${wantsFilmsOnly ? " Movies" : " Shows & Films"}`;
        const cleanRaw = q.replace(/\b(right now|on now|this morning|morning|this afternoon|afternoon|this evening|evening|tonight|primetime|late|tomorrow|yesterday)\b/gi, "").trim() || matchedTopic.label;
        lastQueryContext = { regex: matchedTopic.regex, onlyFilms: wantsFilmsOnly, label, rawQuery: cleanRaw };
        const picks = getSmartPicks({
          regex: matchedTopic.regex,
          onlyFilms: wantsFilmsOnly,
          timeCtx,
          limit: 5
        });
        const lines = [
          picks.fallbackLater && timeCtx.mode === "now"
            ? `No <strong>${escapeHtml(label)}</strong> airing live right this minute &mdash; here is what's coming up next today:`
            : `<strong>${escapeHtml(label)} &bull; ${escapeHtml(timeCtx.label)}</strong>:`
        ];
        if (picks.tv.length) {
          lines.push(picks.tv.map(formatPickLine).join("<br/>"));
        }
        if (picks.stream.length) {
          lines.push(`<strong>Stream On-Demand Now:</strong><br/>` + picks.stream.map(formatStreamLine).join("<br/>"));
        }
        const actions = [
          { label: "⚡ Right Now", onClick: () => handleQuery(`${cleanRaw} right now`) },
          { label: "☀️ This Afternoon", onClick: () => handleQuery(`${cleanRaw} this afternoon`) },
          { label: "🌙 This Evening", onClick: () => handleQuery(`${cleanRaw} this evening`) }
        ];
        addMsg("bot", lines.join("<br/><br/>"), actions);
        return;
      }

      // 8. Clean conversational prefixes for show/channel lookups
      const stripped = q
        .replace(/^(when is|when'?s|what time is|where can i watch|what'?s on|whats on|show me|find me|give me|recommend|search for|search|find|look up|open|go to|switch to|take me to|is|watch)\s+/i, "")
        .replace(/\s+(on next|next on|on tv|playing|showing|tonight|today|tomorrow|on netflix|on iplayer|\?)+$/gi, "")
        .trim();

      const isExplicitNav =
        /^(open|go to|switch to|take me to)\b/i.test(lower) ||
        Boolean(matchedView) ||
        (Boolean(matchedPlat) && stripped.split(/\s+/).length <= 3 && !/when|where|next/i.test(lower)) ||
        (Boolean(matchedCat) && stripped.split(/\s+/).length <= 3 && !/when|where|next/i.test(lower));

      if (!isExplicitNav && stripped.length >= 2) {
        const res = searchAcrossDays(stripped, false);
        lastTopic = stripped;
        lastMatches = res;
        const { tvMatches, streamMatches } = res;
        if (tvMatches.length || streamMatches.length) {
          const nextOnes = tvMatches.filter((m) => m.status === "live" || m.status === "upcoming");
          const pastOnes = tvMatches.filter((m) => m.status === "past");
          const lines = [];
          if (nextOnes.length) {
            lines.push(
              nextOnes
                .slice(0, 4)
                .map((m) => {
                  const bs = getBroadcastStatus(m.prog);
                  return `&bull; <a href="#" data-chat-open-prog="${escapeHtml(m.prog.id)}" data-chat-open-ch="${escapeHtml(m.channel.id)}" style="color:var(--accent);font-weight:700;text-decoration:underline;">${escapeHtml(m.prog.title)}</a>${bs ? ` <em>(${bs})</em>` : ""} &bull; ${m.whenLabel} on <strong>${escapeHtml(m.channel.name)}</strong> <a href="#" data-chat-jump-ch="${escapeHtml(m.channel.id)}" data-chat-jump-day="${m.dayOffset}" data-chat-jump-min="${m.prog.startMin}" style="font-size:11px;color:var(--text-muted);text-decoration:none;">[Guide &nearr;]</a>`;
                })
                .join("<br/>")
            );
          } else if (pastOnes.length) {
            const last = pastOnes[0];
            lines.push(
              `No upcoming airings cached for <a href="#" data-chat-open-prog="${escapeHtml(last.prog.id)}" data-chat-open-ch="${escapeHtml(last.channel.id)}" style="color:var(--accent);font-weight:700;text-decoration:underline;">${escapeHtml(last.prog.title)}</a>.<br/>` +
              `${last.whenLabel} on <strong>${escapeHtml(last.channel.name)}</strong>`
            );
          }
          if (streamMatches.length) {
            const s0 = streamMatches[0];
            lines.push(`Streaming on <strong>${escapeHtml(s0.platform)}</strong>: <a href="#" data-chat-open-stream="${escapeHtml(s0.id)}" style="color:var(--accent);font-weight:700;text-decoration:underline;">${escapeHtml(s0.title)}</a>`);
          }

          const actions = [];
          const primary = nextOnes[0] || pastOnes[0];
          if (primary) {
            actions.push({
              label: `Jump to ${primary.channel.name}`,
              onClick: () => jumpToGuideMatch(primary.channel.id, primary.dayOffset, primary.prog.startMin)
            });
            if (primary.status === "live") {
              const liveUrl = getLiveStreamUrl(primary.channel);
              if (liveUrl) {
                actions.push({ label: "Watch Live ↗", onClick: () => window.open(liveUrl, "_blank", "noopener") });
              }
            }
          }
          if (!primary && streamMatches.length) {
            actions.push({
              label: "Open Details & Watch Links",
              onClick: () => openStreamModal(streamMatches[0].id)
            });
          }
          actions.push({
            label: "Open All Search Results",
            onClick: () => {
              el.globalSearch.value = stripped;
              runSearch(stripped);
            }
          });
          addMsg("bot", lines.join("<br/><br/>"), actions);
          return;
        }

        // Fallback to TVMaze + UK On-Demand links directly in chat!
        const dirItems = await fetchLiveShowDirectoryMatches(stripped);
        if (dirItems.length) {
          const d0 = dirItems[0];
          const enc = encodeURIComponent(d0.title);
          addMsg(
            "bot",
            `<strong>${escapeHtml(d0.title)}</strong> isn't in this week's live TV schedule, so check UK On-Demand:<br/>` +
            `<span style="color:var(--text-muted)">${escapeHtml(d0.genre)} &bull; ${escapeHtml(d0.platform)}</span>`,
            [
              { label: "Netflix ↗", onClick: () => window.open(`https://www.netflix.com/search?q=${enc}`, "_blank", "noopener") },
              { label: "Channel 4 ↗", onClick: () => window.open(`https://www.channel4.com/search?q=${enc}`, "_blank", "noopener") },
              { label: "Open Details", onClick: () => openStreamModal(d0.id) }
            ]
          );
          return;
        }
      }

      // Apply navigation/filter directly when matched
      if (matchedView || matchedPlat || matchedCat || dayJump !== null || hourJump !== null) {
        el.searchResultsSection.classList.add("hidden");
        el.mainContent.classList.remove("hidden");
        if (matchedPlat) {
          state.platform = matchedPlat.id;
          localStorage.setItem("onair_platform", state.platform);
        }
        if (matchedCat) {
          state.epgCategory = matchedCat.id;
        }
        if (dayJump !== null) {
          state.dayOffset = dayJump;
        }
        const targetView = matchedView ? matchedView.id : "epg";
        switchView(targetView);
        renderPlatformPills();
        renderCategoryPills();
        renderDateStrip();
        if (targetView === "epg") {
          renderEPG(true);
          if (hourJump !== null) requestAnimationFrame(() => scrollEpgToHour(hourJump));
        }

        const parts = [];
        if (matchedPlat) parts.push(matchedPlat.name);
        if (matchedCat) parts.push(matchedCat.label);
        if (dayJump !== null) parts.push(getDayLabelShort(dayJump));
        if (matchedView) parts.push(matchedView.label);
        else parts.push("TV Guide");

        const preview = targetView === "epg"
          ? getSmartPicks({
              platId: matchedPlat ? matchedPlat.id : state.platform,
              catId: matchedCat ? matchedCat.id : state.epgCategory,
              onlyFilms: wantsFilmsOnly || (matchedCat && matchedCat.id === "Film"),
              timeCtx,
              limit: 4
            }).tv
          : [];
        if (matchedCat) {
          lastQueryContext = {
            catId: matchedCat.id,
            platId: matchedPlat ? matchedPlat.id : null,
            onlyFilms: wantsFilmsOnly || matchedCat.id === "Film",
            label: `${matchedPlat ? `${matchedPlat.name} ` : ""}${matchedCat.label}`,
            rawQuery: `${matchedPlat ? `${matchedPlat.name} ` : ""}${matchedCat.label}`
          };
        }
        const previewHtml = preview.length
          ? `<br/><br/>` + preview.map(formatPickLine).join("<br/>")
          : "";
        const navActions = preview[0]
          ? [
              {
                label: `Jump to ${preview[0].ch.name}`,
                onClick: () => jumpToGuideMatch(preview[0].ch.id, preview[0].dayOffset, preview[0].prog.startMin)
              },
              {
                label: "Open Top Pick",
                onClick: () => openProgrammeModal(preview[0].prog.id, preview[0].ch.id)
              }
            ]
          : [];

        addMsg("bot", `Moved you to <strong>${escapeHtml(parts.join(" · "))}</strong>.${previewHtml}`, navActions);
        return;
      }

      // Fallback: run global search across ahead & back days
      el.globalSearch.value = stripped || q;
      runSearch(stripped || q);
      addMsg("bot", `Opened full Search across -7d..+6d, Show Vault &amp; UK On-Demand for <strong>"${escapeHtml(stripped || q)}"</strong>.`);
    }

    const prompts = [
      "What's on Pluto TV?",
      "Show me Christmas movies",
      "Go to What to Watch",
      "Open Settings",
      "Live Sport tonight"
    ];
    if (quickEl) {
      quickEl.innerHTML = prompts.map((p) => `<button class="chip-pill" type="button">${p}</button>`).join("");
      quickEl.querySelectorAll("button").forEach((btn) => {
        btn.onclick = () => handleQuery(btn.textContent);
      });
    }

    addMsg("bot", "Hi! Ask me <strong>when a show is on next</strong> (searching ahead &amp; back), or tell me where to take you (e.g. <em>\"Open Pluto TV\"</em>, <em>\"Christmas films\"</em>, <em>\"Go to Settings\"</em>).");

    fab.onclick = () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) input.focus();
    };
    if (closeBtn) closeBtn.onclick = () => panel.classList.add("hidden");
    form.onsubmit = (e) => {
      e.preventDefault();
      const val = input.value;
      input.value = "";
      handleQuery(val);
    };
  }

  // ========================================================================
  // Init
  // ========================================================================
  function renderRegionSelect() {
    if (!el.regionSelect || !ONAIR_LIVE.REGIONS) return;
    const current = ONAIR_LIVE.getRegion ? ONAIR_LIVE.getRegion().id : "ni";
    el.regionSelect.innerHTML = ONAIR_LIVE.REGIONS.map(
      (r) => `<option value="${r.id}" ${r.id === current ? "selected" : ""}>${r.short}</option>`
    ).join("");
    el.regionSelect.onchange = (e) => switchRegion(e.target.value);
  }

  async function switchRegion(regionId) {
    if (!ONAIR_LIVE.setRegion) return;
    const reg = ONAIR_LIVE.setRegion(regionId);
    renderRegionSelect();
    liveEpgByDay.clear();
    await syncLiveData(true, true);
    showToast(`Region switched to ${reg.name}`);
  }

  let lastTmRefreshTs = 0;

  async function loadTimeMachineDate(isoDate, force = false) {
    if (!isoDate) {
      exitTimeMachine();
      return;
    }
    if (force) {
      const waitSec = Math.ceil((lastTmRefreshTs + 15000 - Date.now()) / 1000);
      if (waitSec > 0) {
        showToast(`Please wait ${waitSec}s before refreshing Time Machine again (prevents rate-limit blocks)`);
        return;
      }
      lastTmRefreshTs = Date.now();
    }
    state.timeMachineDate = isoDate;
    timeMachineEpg = {};
    if (el.tmPopover) el.tmPopover.classList.add("hidden");
    if (el.timeMachineBtn) {
      el.timeMachineBtn.classList.add("is-active");
      el.timeMachineBtn.setAttribute("aria-expanded", "false");
    }
    const shortPretty = new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    if (el.timeMachineBtnLabel) el.timeMachineBtnLabel.textContent = shortPretty;

    if (el.timeMachineBanner) {
      el.timeMachineBanner.classList.remove("hidden");
      el.timeMachineBanner.innerHTML = `<span>🕰️ Loading Time Machine TV Guide for <strong>${escapeHtml(shortPretty)}</strong>...</span>`;
    }
    renderDateStrip();
    renderEPG(false);

    const renderTmBanner = (dataRes) => {
      const prettyDate = new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
      const tv24Url = (dataRes && dataRes.tv24Url) || `https://tv24.co.uk/tv/${isoDate}`;
      const genomeUrl = (dataRes && dataRes.genomeUrl) || `https://genome.ch.bbc.co.uk/schedules/service_bbc_one_northern_ireland/${isoDate}`;
      const count = (dataRes && dataRes.totalEvents) || 0;
      const src = (dataRes && dataRes.sourceLabel) || "Archive";
      const issueHtml = dataRes && dataRes.issueNote
        ? `<div style="width:100%; font-size:11.5px; color:#d97706; margin-top:4px;">&#9888;&#65039; ${escapeHtml(dataRes.issueNote)}</div>`
        : "";
      const xmasLinks = isoDate.slice(5, 7) === "12"
        ? `<a href="https://www.bbc.co.uk/mediacentre/christmas-on-the-bbc" target="_blank" rel="noopener noreferrer" class="ghost-btn" style="text-decoration:none; padding:5px 10px; font-size:12px;">🎄 BBC Christmas ↗</a><a href="https://tvradar.uk/christmas-tv-guide" target="_blank" rel="noopener noreferrer" class="ghost-btn" style="text-decoration:none; padding:5px 10px; font-size:12px;">🎄 TV Radar ↗</a>`
        : "";
      if (el.timeMachineBanner) {
        el.timeMachineBanner.innerHTML = `
          <div>
            <strong>🕰️ Time Machine: ${escapeHtml(prettyDate)}</strong>
            <span style="color:var(--text-muted); margin-left:8px;">${count} programmes (${escapeHtml(src)})</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button id="tmRefreshBtn" class="ghost-btn" type="button" style="padding:5px 10px; font-size:12px;">&#8635; Refresh</button>
            ${xmasLinks}
            <a href="${escapeHtml(genomeUrl)}" target="_blank" rel="noopener noreferrer" class="ghost-btn" style="text-decoration:none; padding:5px 10px; font-size:12px;">BBC Genome ↗</a>
            <a href="${escapeHtml(tv24Url)}" target="_blank" rel="noopener noreferrer" class="ghost-btn" style="text-decoration:none; padding:5px 10px; font-size:12px;">tv24.co.uk ↗</a>
            <button id="tmExitBtn" class="btn-primary" type="button" style="padding:5px 12px; font-size:12px;">Back to Live Guide</button>
          </div>
          ${issueHtml}
        `;
        const refreshBtn = document.getElementById("tmRefreshBtn");
        if (refreshBtn) refreshBtn.onclick = () => loadTimeMachineDate(isoDate, true);
        const exitBtn = document.getElementById("tmExitBtn");
        if (exitBtn) exitBtn.onclick = exitTimeMachine;
      }
    };

    const res = ONAIR_LIVE.fetchTimeMachineDay
      ? await ONAIR_LIVE.fetchTimeMachineDay(isoDate, liveChannels, (updatedRes) => {
          if (state.timeMachineDate !== isoDate) return;
          timeMachineEpg = updatedRes.schedulesBySid || {};
          renderTmBanner(updatedRes);
          renderEPG(false);
        }, force).catch(() => null)
      : null;

    if (state.timeMachineDate !== isoDate) return;
    timeMachineEpg = (res && res.schedulesBySid) || {};
    renderTmBanner(res);
    renderEPG(false);
  }

  function exitTimeMachine() {
    state.timeMachineDate = null;
    timeMachineEpg = null;
    if (el.tmPopover) el.tmPopover.classList.add("hidden");
    if (el.timeMachineBtn) {
      el.timeMachineBtn.classList.remove("is-active");
      el.timeMachineBtn.setAttribute("aria-expanded", "false");
    }
    if (el.timeMachineBtnLabel) el.timeMachineBtnLabel.textContent = "Time Machine";
    syncGuideModeUI();
    if (el.timeMachineBanner) {
      el.timeMachineBanner.classList.add("hidden");
      el.timeMachineBanner.innerHTML = "";
    }
    renderDateStrip();
    renderEPG(false);
    ensureSchedulesForChannels(getFilteredChannels(state.epgCategory), state.dayOffset, false);
  }

  function initTimeMachinePicker() {
    if (!el.timeMachineBtn || !el.tmPopover) return;
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth(); // 0..11

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const maxYear = now.getFullYear() + 1;
    const minYear = 1989;

    function renderCalendar() {
      const yearOptions = [];
      for (let y = maxYear; y >= minYear; y--) {
        yearOptions.push(`<option value="${y}" ${y === viewYear ? "selected" : ""}>${y}</option>`);
      }
      const monthOptions = months.map((m, idx) => `<option value="${idx}" ${idx === viewMonth ? "selected" : ""}>${m}</option>`);

      const firstDay = new Date(viewYear, viewMonth, 1);
      const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0 .. Sun=6
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

      const cells = [];
      for (let i = 0; i < startOffset; i++) {
        cells.push(`<span></span>`);
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const isToday = iso === todayIso;
        const isSelected = iso === state.timeMachineDate;
        cells.push(`<button type="button" class="tm-day-btn ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" data-tm-iso="${iso}">${d}</button>`);
      }

      const oneYrAgo = new Date(now);
      oneYrAgo.setFullYear(now.getFullYear() - 1);
      const fiveYrAgo = new Date(now);
      fiveYrAgo.setFullYear(now.getFullYear() - 5);
      const fmtIso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

      const activeSeason = getActiveSeason();
      const yNow = now.getFullYear();
      const seasonalPresetsById = {
        christmas: [
          { label: "🎄 Xmas Eve", iso: `${now.getMonth() === 11 && now.getDate() > 26 ? yNow + 1 : yNow}-12-24` },
          { label: "🎄 Xmas Day", iso: `${now.getMonth() === 11 && now.getDate() > 26 ? yNow + 1 : yNow}-12-25` },
          { label: "🎄 Boxing Day", iso: `${now.getMonth() === 11 && now.getDate() > 26 ? yNow + 1 : yNow}-12-26` }
        ],
        winter: [
          { label: "🎆 New Year's Day", iso: `${yNow}-01-01` },
          { label: "❄️ Winter Specials", iso: `${yNow}-01-15` },
          { label: "🎄 Last Xmas Day", iso: `${yNow - 1}-12-25` }
        ],
        valentines: [
          { label: "💘 Valentine's Day", iso: `${yNow}-02-14` },
          { label: "💘 Valentine's Eve", iso: `${yNow}-02-13` },
          { label: "🎄 Last Xmas Day", iso: `${yNow - 1}-12-25` }
        ],
        easter: [
          { label: "🐣 Easter Weekend", iso: `${yNow}-04-05` },
          { label: "🐣 Spring Bank", iso: `${yNow}-04-12` },
          { label: "🎄 Last Xmas Day", iso: `${yNow - 1}-12-25` }
        ],
        summer: [
          { label: "☀️ Summer Solstice", iso: `${yNow}-06-21` },
          { label: "🏆 July Finals", iso: `${yNow}-07-14` },
          { label: "☀️ Aug Bank Hol", iso: `${yNow}-08-25` }
        ],
        autumn: [
          { label: "🍂 Autumn Equinox", iso: `${yNow}-09-22` },
          { label: "🍂 Oct Premieres", iso: `${yNow}-10-01` },
          { label: "🎃 Last Halloween", iso: `${yNow - 1}-10-31` }
        ],
        halloween: [
          { label: "🎃 Halloween", iso: `${yNow}-10-31` },
          { label: "🎃 Fright Night", iso: `${yNow}-10-30` },
          { label: "🎆 Bonfire Night", iso: `${yNow}-11-05` }
        ]
      };
      const seasonChips = isSeasonalMode() ? (seasonalPresetsById[activeSeason.id] || seasonalPresetsById.christmas) : [];
      const presets = [
        ...seasonChips,
        { label: "1 Year Ago", iso: fmtIso(oneYrAgo) },
        { label: "5 Years Ago", iso: fmtIso(fiveYrAgo) },
        { label: "27 May 2020", iso: "2020-05-27" },
        { label: "Live (Today)", iso: "" }
      ];

      el.tmPopover.innerHTML = `
        <div class="tm-pop-header">
          <button type="button" class="tm-pop-nav" id="tmPrevMonth" aria-label="Previous month">&lsaquo;</button>
          <div class="tm-pop-selects">
            <select id="tmMonthSelect" class="tm-pop-select" aria-label="Month">${monthOptions.join("")}</select>
            <select id="tmYearSelect" class="tm-pop-select" aria-label="Year">${yearOptions.join("")}</select>
          </div>
          <button type="button" class="tm-pop-nav" id="tmNextMonth" aria-label="Next month">&rsaquo;</button>
        </div>
        <div class="tm-weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
        <div class="tm-days-grid">${cells.join("")}</div>
        <div class="tm-presets">
          ${presets.map((p) => `<button type="button" class="tm-preset-btn" data-tm-preset="${p.iso}">${p.label}</button>`).join("")}
        </div>
      `;

      document.getElementById("tmPrevMonth").onclick = (e) => {
        e.stopPropagation();
        viewMonth--;
        if (viewMonth < 0) {
          viewMonth = 11;
          viewYear = Math.max(minYear, viewYear - 1);
        }
        renderCalendar();
      };
      document.getElementById("tmNextMonth").onclick = (e) => {
        e.stopPropagation();
        viewMonth++;
        if (viewMonth > 11) {
          viewMonth = 0;
          viewYear = Math.min(maxYear, viewYear + 1);
        }
        renderCalendar();
      };
      document.getElementById("tmMonthSelect").onchange = (e) => {
        viewMonth = Number(e.target.value);
        renderCalendar();
      };
      document.getElementById("tmYearSelect").onchange = (e) => {
        viewYear = Number(e.target.value);
        renderCalendar();
      };
      el.tmPopover.querySelectorAll("[data-tm-iso]").forEach((btn) => {
        btn.onclick = () => loadTimeMachineDate(btn.dataset.tmIso);
      });
      el.tmPopover.querySelectorAll("[data-tm-preset]").forEach((btn) => {
        btn.onclick = () => {
          const iso = btn.dataset.tmPreset;
          if (!iso) {
            exitTimeMachine();
          } else {
            const [y, m] = iso.split("-").map(Number);
            viewYear = y;
            viewMonth = m - 1;
            loadTimeMachineDate(iso);
          }
        };
      });
    }

    el.timeMachineBtn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = el.tmPopover.classList.contains("hidden");
      if (willOpen) {
        if (state.timeMachineDate) {
          const [y, m] = state.timeMachineDate.split("-").map(Number);
          if (y && m) {
            viewYear = y;
            viewMonth = m - 1;
          }
        }
        renderCalendar();
        if (window.innerWidth <= 768) {
          if (el.tmPopover.parentElement !== document.body) {
            document.body.appendChild(el.tmPopover);
          }
          el.tmPopover.style.left = "";
          el.tmPopover.style.right = "";
        } else {
          if (el.tmPickerWrap && el.tmPopover.parentElement !== el.tmPickerWrap) {
            el.tmPickerWrap.appendChild(el.tmPopover);
          }
          const btnRect = el.timeMachineBtn.getBoundingClientRect();
          if (btnRect.left + 312 > window.innerWidth) {
            el.tmPopover.style.left = "auto";
            el.tmPopover.style.right = "0";
          } else {
            el.tmPopover.style.left = "0";
            el.tmPopover.style.right = "auto";
          }
        }
        el.tmPopover.classList.remove("hidden");
        el.timeMachineBtn.setAttribute("aria-expanded", "true");
      } else {
        el.tmPopover.classList.add("hidden");
        el.timeMachineBtn.setAttribute("aria-expanded", "false");
      }
    };

    document.addEventListener("click", (e) => {
      const inWrap = el.tmPickerWrap && el.tmPickerWrap.contains(e.target);
      const inPop = el.tmPopover && el.tmPopover.contains(e.target);
      if (!inWrap && !inPop) {
        el.tmPopover.classList.add("hidden");
        el.timeMachineBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  let syncDebugConsoleVisibility = null;

  function uiDebug(level, source, message, ms = null) {
    if (ONAIR_LIVE && typeof ONAIR_LIVE.logDebug === "function") {
      ONAIR_LIVE.logDebug(level, source, message, ms);
    }
  }

  function runUiDiagnosticAudit(verbose = false) {
    const t0 = performance.now();
    const missingDom = [];
    Object.entries(el).forEach(([key, val]) => {
      if (!val || (typeof NodeList !== "undefined" && val instanceof NodeList && val.length === 0)) {
        missingDom.push(key);
      }
    });

    const criticalIds = [
      "helpGuideBtn",
      "guideModeToggleBtn",
      "themeToggleBtn",
      "liveRefreshBtn",
      "watchlistBtn",
      "timeMachineBtn",
      "chatFab",
      "detailModal",
      "modalBody",
      "onboardingModal"
    ];
    criticalIds.forEach((id) => {
      if (!document.getElementById(id)) missingDom.push(`#${id}`);
    });

    const brokenPlatforms = [];
    if (typeof WATCH_PLATFORMS === "object" && WATCH_PLATFORMS) {
      Object.entries(WATCH_PLATFORMS).forEach(([name, cfg]) => {
        const testUrl = cfg && (typeof cfg.url === "function" ? cfg.url("test") : cfg.url);
        if (!testUrl || !/^https?:\/\//i.test(testUrl)) {
          brokenPlatforms.push(name);
        }
      });
    }

    const ms = Math.round(performance.now() - t0);
    if (missingDom.length > 0) {
      uiDebug("error", "UI Audit", `Missing DOM elements: ${missingDom.join(", ")}`, ms);
    } else if (verbose) {
      uiDebug("ok", "UI Audit", `All ${Object.keys(el).length} DOM refs & ${criticalIds.length} interactive controls verified`, ms);
    }

    if (brokenPlatforms.length > 0) {
      uiDebug("error", "App Links", `Invalid platform URLs in WATCH_PLATFORMS: ${brokenPlatforms.join(", ")}`, ms);
    } else if (verbose) {
      uiDebug("ok", "App Links", `All ${Object.keys(WATCH_PLATFORMS || {}).length} UK streaming & catch-up app targets valid`, ms);
    }

    const docW = document.documentElement.clientWidth || window.innerWidth;
    const scrollW = document.documentElement.scrollWidth || docW;
    if (scrollW > docW + 2) {
      uiDebug("warn", "Viewport", `Horizontal overflow detected: scrollWidth=${scrollW}px > clientWidth=${docW}px`, ms);
    } else if (verbose) {
      uiDebug("ok", "Viewport", `Viewport locked cleanly at ${docW}px (zero horizontal overflow)`, ms);
    }

    return { missingDom, brokenPlatforms };
  }

  function initDebugConsole() {
    const wrap = document.getElementById("debugDrawerWrap");
    const fab = document.getElementById("debugFab");
    const panel = document.getElementById("debugPanel");
    const listEl = document.getElementById("debugLogList");
    const summaryEl = document.getElementById("debugSummaryLine");
    const badgeEl = document.getElementById("debugCountBadge");
    const filterBar = document.getElementById("debugFilterBar");
    const auditBtn = document.getElementById("debugAuditBtn");
    const copyBtn = document.getElementById("debugCopyBtn");
    const clearBtn = document.getElementById("debugClearBtn");
    const closeBtn = document.getElementById("debugCloseBtn");
    if (!wrap || !fab || !panel || !listEl) return;

    let levelFilter = "all";

    // 1. Track uncaught JS errors and unhandled promise rejections
    window.addEventListener("error", (ev) => {
      const loc = ev.filename ? ` (${ev.filename.split("/").pop()}:${ev.lineno || 0})` : "";
      uiDebug("error", "Runtime", `${ev.message || "Uncaught script error"}${loc}`);
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = ev.reason && (ev.reason.message || String(ev.reason)) ? (ev.reason.message || String(ev.reason)) : "Unhandled Promise rejection";
      uiDebug("error", "Async", reason);
    });

    // 2. Track UI icon/button selections, modal opens, and external streaming app launches
    const getUiSnapshot = () => ({
      view: state.view,
      platform: state.platform,
      cat: state.epgCategory,
      day: state.dayOffset,
      guideMode: state.guideMode,
      theme: state.theme,
      detailOpen: Boolean(el.detailModal && !el.detailModal.classList.contains("hidden")),
      onboardOpen: Boolean(el.onboardingModal && !el.onboardingModal.classList.contains("hidden")),
      watchlistOpen: Boolean(el.watchlistDrawer && !el.watchlistDrawer.classList.contains("hidden")),
      chatOpen: Boolean(document.getElementById("chatPanel") && !document.getElementById("chatPanel").classList.contains("hidden")),
      tmOpen: Boolean(el.tmPopover && !el.tmPopover.classList.contains("hidden")),
      searchOpen: Boolean(el.searchResultsSection && !el.searchResultsSection.classList.contains("hidden"))
    });

    document.addEventListener(
      "click",
      (ev) => {
        const target = ev.target && ev.target.closest
          ? ev.target.closest("a, button, [role='tab'], .epg-prog, .stream-card, .nn-card, .wtw-card, .feed-card")
          : null;
        if (!target) return;
        // Ignore clicks inside the debug panel itself (except Audit UI)
        if (panel.contains(target) && target.id !== "debugAuditBtn") return;

        const t0 = performance.now();
        const tag = (target.tagName || "").toLowerCase();
        const id = target.id ? `#${target.id}` : "";
        const aria = target.getAttribute("aria-label") || target.getAttribute("title") || "";
        const rawText = (target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48);
        const label = rawText || aria || id || tag;

        // A. External App / Catch-Up / Streaming Link Launch Tracking
        if (tag === "a") {
          const href = (target.getAttribute("href") || "").trim();
          if (!href || href === "#" || /^javascript:/i.test(href)) {
            if (!target.hasAttribute("data-chat-open-prog") && !target.hasAttribute("data-chat-open-stream") && !target.hasAttribute("data-chat-jump-ch")) {
              uiDebug("error", "AppLaunch", `Broken or empty link clicked on "${label}" (href="${href || "empty"}")`);
            }
            return;
          }
          try {
            const urlObj = new URL(href, window.location.origin);
            uiDebug("ui", "AppLaunch", `Launching "${label}" -> ${urlObj.hostname}${urlObj.pathname.slice(0, 36)}`);
          } catch (_) {
            uiDebug("error", "AppLaunch", `Malformed URL on "${label}": ${href}`);
          }
          return;
        }

        // B. Disabled control check
        if (target.disabled || target.getAttribute("aria-disabled") === "true") {
          uiDebug("warn", "UI Blocked", `Clicked disabled control "${label}" ${id}`);
          return;
        }

        const before = getUiSnapshot();

        setTimeout(() => {
          const ms = Math.round(performance.now() - t0);
          const after = getUiSnapshot();

          // Specific high-value failure checks for icons, modals, drawers & cards
          if (target.id === "helpGuideBtn" || target.id === "openHelpGuideFromSettingsBtn") {
            if (!after.detailOpen) {
              uiDebug("error", "UI Failure", `Help button (${id}) clicked but #detailModal failed to open`, ms);
            } else {
              uiDebug("ui", "HelpGuide", `Opened Help & Quick Guide via ${id}`, ms);
            }
            return;
          }

          if (target.classList.contains("epg-prog") || target.hasAttribute("data-prog-id") || target.hasAttribute("data-stream-id") || target.hasAttribute("data-sim-prog")) {
            if (!after.detailOpen) {
              uiDebug("error", "UI Failure", `Programme/Stream card "${label}" clicked but #detailModal did not open`, ms);
            } else {
              uiDebug("ui", "ModalOpen", `Opened details for "${label}"`, ms);
            }
            return;
          }

          if (target.id === "watchlistBtn") {
            if (before.watchlistOpen === after.watchlistOpen) {
              uiDebug("error", "UI Failure", `Watchlist button clicked but drawer did not toggle`, ms);
            } else {
              uiDebug("ui", "Watchlist", `Watchlist drawer ${after.watchlistOpen ? "opened" : "closed"}`, ms);
            }
            return;
          }

          if (target.id === "timeMachineBtn") {
            if (before.tmOpen === after.tmOpen) {
              uiDebug("error", "UI Failure", `Time Machine button clicked but calendar popover did not toggle`, ms);
            } else {
              uiDebug("ui", "TimeMachine", `Calendar popover ${after.tmOpen ? "opened" : "closed"}`, ms);
            }
            return;
          }

          if (target.id === "chatFab") {
            if (before.chatOpen === after.chatOpen) {
              uiDebug("error", "UI Failure", `Ask OnAir button clicked but chat panel did not toggle`, ms);
            } else {
              uiDebug("ui", "Assistant", `Ask OnAir panel ${after.chatOpen ? "opened" : "closed"}`, ms);
            }
            return;
          }

          if (target.id === "themeToggleBtn") {
            if (before.theme === after.theme) {
              uiDebug("error", "UI Failure", `Theme icon clicked but theme remained "${after.theme}"`, ms);
            } else {
              uiDebug("ui", "Theme", `Switched theme: ${before.theme} -> ${after.theme}`, ms);
            }
            return;
          }

          if (target.id === "guideModeToggleBtn") {
            if (before.guideMode === after.guideMode) {
              uiDebug("error", "UI Failure", `Guide mode button clicked but mode remained "${after.guideMode}"`, ms);
            } else {
              uiDebug("ui", "GuideMode", `Switched mode: ${before.guideMode} -> ${after.guideMode}`, ms);
            }
            return;
          }

          if (target.classList.contains("nav-tab")) {
            uiDebug("ui", "Navigation", `Tab selected: "${label}" (view=${after.view})`, ms);
            return;
          }

          if (target.hasAttribute("data-platform")) {
            uiDebug("ui", "Platform", `Switched platform to "${label}" (${after.platform})`, ms);
            return;
          }

          if (target.hasAttribute("data-cat") || target.hasAttribute("data-nncat")) {
            uiDebug("ui", "Category", `Selected genre filter "${label}"`, ms);
            return;
          }

          // Generic icon/button click log
          uiDebug("ui", "UI Click", `Selected "${label}"${id ? ` (${id})` : ""}`, ms);
        }, 45);
      },
      true
    );

    document.addEventListener(
      "change",
      (ev) => {
        const t = ev.target;
        if (!t || panel.contains(t)) return;
        const id = t.id ? `#${t.id}` : t.tagName;
        const val = t.type === "checkbox" ? (t.checked ? "ON" : "OFF") : String(t.value || "").slice(0, 40);
        uiDebug("ui", "SettingChange", `Changed ${id} -> ${val}`);
      },
      true
    );

    function renderDebugLogs() {
      const logs = ONAIR_LIVE.getDebugLogs ? ONAIR_LIVE.getDebugLogs() : [];
      const errCount = logs.filter((l) => l.level === "error").length;
      if (badgeEl) {
        badgeEl.textContent = errCount > 0 ? `${logs.length} · ${errCount}⚠️` : String(logs.length);
      }

      const health = ONAIR_LIVE.getFeedHealth ? ONAIR_LIVE.getFeedHealth() : {};
      const regionShort = ONAIR_LIVE.getRegion ? ONAIR_LIVE.getRegion().short : "UK";
      const backoffs = health.backoffHosts && health.backoffHosts.length ? `Backoff: ${health.backoffHosts.join(", ")}` : "No backoffs";
      if (summaryEl) {
        summaryEl.textContent = `Region: ${regionShort} • Sky: ${health.sky ? health.sky.status : "?"} • Pluto: ${health.pluto ? health.pluto.status : "?"} • Tubi: ${health.tubi ? health.tubi.status : "?"} • Errors: ${errCount} • ${backoffs}`;
      }

      if (panel.classList.contains("hidden")) return;
      const filtered = levelFilter === "all" ? logs : logs.filter((l) => l.level === levelFilter);
      if (!filtered.length) {
        listEl.innerHTML = `<div style="padding:16px; color:var(--text-muted); text-align:center;">No debug events recorded for this filter yet.</div>`;
        return;
      }
      listEl.innerHTML = filtered
        .map(
          (l) => `
          <div class="debug-log-row debug-level-${escapeHtml(l.level || "info")}">
            <span style="color:var(--text-muted);">${escapeHtml(l.timeStr)}</span>
            <span class="debug-src-tag">${escapeHtml(l.source)}</span>
            <span style="word-break:break-word;">${escapeHtml(l.message)}</span>
            <span style="color:var(--text-muted);">${l.ms !== null && l.ms !== undefined ? `${l.ms}ms` : ""}</span>
          </div>
        `
        )
        .join("");
    }

    syncDebugConsoleVisibility = () => {
      wrap.classList.toggle("hidden", !state.debugMode);
      if (!state.debugMode) panel.classList.add("hidden");
      renderDebugLogs();
    };

    fab.onclick = () => {
      panel.classList.toggle("hidden");
      renderDebugLogs();
    };
    if (closeBtn) closeBtn.onclick = () => panel.classList.add("hidden");
    if (auditBtn) {
      auditBtn.onclick = () => {
        const res = runUiDiagnosticAudit(true);
        renderDebugLogs();
        showToast(
          res.missingDom.length || res.brokenPlatforms.length
            ? `UI Audit found ${res.missingDom.length + res.brokenPlatforms.length} issue(s)`
            : "UI Audit passed: All icons, modals & app links OK"
        );
      };
    }
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (ONAIR_LIVE.clearDebugLogs) ONAIR_LIVE.clearDebugLogs();
        renderDebugLogs();
      };
    }
    if (copyBtn) {
      copyBtn.onclick = () => {
        const logs = ONAIR_LIVE.getDebugLogs ? ONAIR_LIVE.getDebugLogs() : [];
        const text = logs.map((l) => `[${l.timeStr}] [${l.level.toUpperCase()}] ${l.source}: ${l.message}${l.ms != null ? ` (${l.ms}ms)` : ""}`).join("\n");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => showToast("Debug logs copied"));
        }
      };
    }
    if (filterBar) {
      filterBar.querySelectorAll("[data-dbg-level]").forEach((btn) => {
        btn.onclick = () => {
          levelFilter = btn.dataset.dbgLevel || "all";
          filterBar.querySelectorAll("[data-dbg-level]").forEach((b) => b.classList.toggle("is-active", b === btn));
          renderDebugLogs();
        };
      });
    }
    window.addEventListener("onair:debug-log", renderDebugLogs);
    runUiDiagnosticAudit(false);
    syncDebugConsoleVisibility();
  }

  function openHelpGuideModal() {
    const modalEl = el.detailModal || document.getElementById("detailModal");
    const bodyEl = el.modalBody || document.getElementById("modalBody");
    if (!modalEl || !bodyEl) {
      uiDebug("error", "HelpGuide", "Cannot open Help Guide: #detailModal or #modalBody not found in DOM");
      return;
    }
    bodyEl.innerHTML = `
      <div class="modal-kicker">
        <span class="mini-tag">Interactive Help &amp; Quick Guide</span>
        <span class="mini-tag">UK &amp; Ireland TV + Streaming</span>
      </div>
      <h2 id="modalTitle" class="modal-title">Welcome to OnAir UK</h2>
      <p class="modal-synopsis" style="margin-bottom:14px;">
        Everything you need to browse live UK &amp; Ireland TV, free FAST channels, historical archives back to 1989, and UK catch-up streaming.
      </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:10px; margin-bottom:16px;">
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated);">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">📺 Live TV &amp; 7 Platforms</strong>
          <span style="font-size:12px; color:var(--text-secondary); line-height:1.45; display:block;">
            Switch between <strong>Freeview, Sky, Virgin, BT/EE, Freesat, Pluto TV &amp; Tubi</strong>. Pick your UK/NI/ROI region in the top bar for local BBC, UTV/STV &amp; RTÉ schedules.
          </span>
        </div>
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated);">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">🕰️ Time Machine (1989–Today)</strong>
          <span style="font-size:12px; color:var(--text-secondary); line-height:1.45; display:block;">
            Browse +/- 7 days in the date bar, or click <strong>Time Machine</strong> to jump to any date back to 1989 using BBC Genome, TVMaze &amp; tv24 archives.
          </span>
        </div>
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated);">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">💬 Ask OnAir Assistant</strong>
          <span style="font-size:12px; color:var(--text-secondary); line-height:1.45; display:block;">
            Ask natural questions with time clues: <em>"horror movies"</em> (right now), <em>"horror movies this evening"</em>, <em>"when is The Traitors on next?"</em>, or click any show title to open its details.
          </span>
        </div>
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated);">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">🎄 Normal vs Seasonal Guide</strong>
          <span style="font-size:12px; color:var(--text-secondary); line-height:1.45; display:block;">
            Use the header toggle to switch between <strong>Normal Guide</strong> (clean everyday view) and <strong>Seasonal Mode</strong> (auto-adapts to Christmas, Winter, Easter, Summer &amp; Halloween).
          </span>
        </div>
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated);">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">🎬 Shows &amp; Movies Like This</strong>
          <span style="font-size:12px; color:var(--text-secondary); line-height:1.45; display:block;">
            Every show &amp; film modal includes franchise/spinoff matches (e.g. UK/US/AU/NZ editions), cast/presenter chips, and direct UK catch-up links (BBC iPlayer, ITVX, Channel 4, My5).
          </span>
        </div>
        <div style="padding:12px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-elevated);">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">📱 Mobile Portrait &amp; Landscape</strong>
          <span style="font-size:12px; color:var(--text-secondary); line-height:1.45; display:block;">
            Swipe horizontally &amp; vertically across the EPG grid. In <strong>Settings</strong>, enable <strong>Compact EPG Rows</strong> or adjust <strong>Timeline Zoom</strong> to fit more channels on screen.
          </span>
        </div>
      </div>

      <div style="padding:12px 14px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-secondary); margin-bottom:16px; font-size:12px; color:var(--text-secondary);">
        <strong style="color:var(--text-primary); display:block; margin-bottom:6px;">⌨️ Quick Keyboard Shortcuts (Desktop)</strong>
        <div style="display:flex; flex-wrap:wrap; gap:10px 18px;">
          <span><code>/</code> Focus Search</span>
          <span><code>N</code> Jump to Now</span>
          <span><code>P</code> Jump to Primetime (20:00)</span>
          <span><code>?</code> Open Help Guide</span>
          <span><code>Esc</code> Close Modals / Drawers</span>
        </div>
      </div>

      <div class="modal-actions">
        <button id="helpOpenAssistantBtn" class="btn-primary" type="button">💬 Try Ask OnAir</button>
        <button id="helpOpenSettingsBtn" class="btn-secondary" type="button">⚙️ Open Settings</button>
        <button id="helpRunWizardBtn" class="btn-secondary" type="button">✨ Setup Wizard</button>
      </div>
    `;
    modalEl.classList.remove("hidden");
    const tryChat = document.getElementById("helpOpenAssistantBtn");
    if (tryChat) {
      tryChat.onclick = () => {
        closeModal();
        const panel = document.getElementById("chatPanel");
        const input = document.getElementById("chatInput");
        if (panel) panel.classList.remove("hidden");
        if (input) input.focus();
      };
    }
    const openSet = document.getElementById("helpOpenSettingsBtn");
    if (openSet) {
      openSet.onclick = () => {
        closeModal();
        switchView("settings");
      };
    }
    const runWiz = document.getElementById("helpRunWizardBtn");
    if (runWiz) {
      runWiz.onclick = () => {
        closeModal();
        openOnboardingWizard(1);
      };
    }
  }

  function init() {
    applyTheme();
    renderPlatformPills();
    renderRegionSelect();
    initTimeMachinePicker();
    initDebugConsole();
    renderCategoryPills();
    renderDateStrip();
    renderWatchlist();
    renderEPG();
    bindEvents();
    initChatBot();

    const helpBtn = document.getElementById("helpGuideBtn");
    if (helpBtn) {
      helpBtn.onclick = () => openHelpGuideModal();
    }
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
      if (e.key === "?") {
        e.preventDefault();
        openHelpGuideModal();
      }
    });

    if (state.defaultView && state.defaultView !== "epg") {
      switchView(state.defaultView);
    }

    // Auto-scroll EPG to current time on load
    requestAnimationFrame(() => scrollEpgToHour("now"));

    // Show first-time setup wizard once per browser
    if (!localStorage.getItem("onair_onboarded_v1")) {
      openOnboardingWizard(1);
    }

    // Initial load uses persistent Show Vault & cached streaming/RSS (zero redundant API calls)
    syncLiveData(false);

    // Live-update ONLY TV schedule, What's On, and recommendations per user setting
    scheduleAutoRefresh();

    // Every 1 min: keep NOW line, LIVE tags, Seasonal chip, What's On & recommendations current in real time
    let lastSeasonId = getActiveSeason().id;
    setInterval(() => {
      const currentSeasonId = getActiveSeason().id;
      if (currentSeasonId !== lastSeasonId) {
        lastSeasonId = currentSeasonId;
        renderCategoryPills();
      }
      checkDueReminders();
      if (state.view === "epg" && state.dayOffset === 0) renderEPG(false);
      else if (state.view === "now-next") renderNowNext(false);
      else if (state.view === "what-to-watch") renderWhatToWatch();
    }, 60 * 1000);
  }

  init();
})();
