/* ==========================================================================
   OnAir UK — Interactive TV Guide, Streaming & What to Watch Application
   ========================================================================== */

(() => {
  const { PLATFORMS, CHANNEL_CATEGORIES, INTEREST_CATEGORIES, CHANNELS, STREAMING_CATALOGUE } = ONAIR_DATA;

  const START_HOUR = 6; // 06:00
  const END_HOUR = 24; // 00:00
  const PIXELS_PER_MIN = 4; // 240px per hour

  // Persistent State
  const state = {
    view: "epg",
    platform: localStorage.getItem("onair_platform") || "sky",
    epgCategory: "All",
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
    theme: localStorage.getItem("onair_theme") || "system",
    refreshMins: Number(localStorage.getItem("onair_refresh_mins") || 30),
    lowDataMode: localStorage.getItem("onair_low_data") === "1",
    seasonOverride: localStorage.getItem("onair_season_override") || "auto",
    seasonalSourceFilter: "all"
  };

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

  function getMergedCatalogue() {
    const seen = new Set(STREAMING_CATALOGUE.map((i) => i.title.toLowerCase()));
    const extras = liveStreamingItems.filter((i) => !seen.has(i.title.toLowerCase()));
    return [...extras, ...STREAMING_CATALOGUE];
  }

  function getSchedule(channelId, dayOffset) {
    const ch = liveChannels.find((c) => c.id === channelId);
    if (!ch || !ch.sid) return [];
    const dayMap = liveEpgByDay.get(dayOffset);
    if (!dayMap || !dayMap[ch.sid]) return null; // null = not fetched yet
    return dayMap[ch.sid];
  }

  async function ensureSchedulesForChannels(channels, dayOffset, force = false) {
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
            if (pluto.schedules[c.id]) currentMap[c.sid] = pluto.schedules[c.id];
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
            if (tubi.schedules[c.id]) currentMap[c.sid] = tubi.schedules[c.id];
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
  function formatTime(minutesFromMidnight) {
    const h = Math.floor(minutesFromMidnight / 60) % 24;
    const m = minutesFromMidnight % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function getNowMinutes() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins < START_HOUR * 60 ? START_HOUR * 60 : mins;
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

  function getFilteredChannels(category) {
    const filtered = liveChannels.filter((ch) => {
      if (ch.numbers[state.platform] === null || ch.numbers[state.platform] === undefined) {
        return false;
      }
      if (category === "Favorites") return state.favorites.has(ch.id);
      if (category !== "All" && ch.category !== category) return false;
      return true;
    }).sort((a, b) => Number(a.numbers[state.platform]) - Number(b.numbers[state.platform]));

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
    return Array.from(byNum.values()).sort((a, b) => Number(a.numbers[state.platform]) - Number(b.numbers[state.platform]));
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
    const cats = [...CHANNEL_CATEGORIES.slice(0, 2), { id: "Seasonal", label: season.chip }, ...CHANNEL_CATEGORIES.slice(2)];
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
        `<button class="date-btn ${pastClass} ${state.dayOffset === i ? "is-active" : ""}" data-day="${i}" type="button" role="tab">${label}</button>`
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
    const channels = filterChannelsByCurrentProgramme(platformChannels, state.epgCategory, state.dayOffset, nowMin);
    const totalMinutes = (END_HOUR - START_HOUR) * 60;
    const trackWidth = totalMinutes * PIXELS_PER_MIN;

    // Time Header
    let ticksHtml = "";
    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += 30) {
      const isHour = m % 60 === 0;
      ticksHtml += `<div class="epg-time-tick ${isHour ? "is-hour" : ""}">${formatTime(m)}</div>`;
    }

    let rowsHtml = "";
    if (channels.length === 0) {
      rowsHtml = `<div class="empty-state" style="padding: 60px 24px;">No channels match this filter on the selected platform.</div>`;
    } else {
      rowsHtml = channels
        .map((ch) => {
          const progs = getSchedule(ch.id, state.dayOffset);
          const isFav = state.favorites.has(ch.id);
          const chNum = ch.numbers[state.platform];

          let progsHtml = "";
          if (progs === null) {
            progsHtml = `<div style="padding:26px 20px; font-size:12px; color:var(--text-muted);">Fetching live schedule...</div>`;
          } else if (progs.length === 0) {
            progsHtml = `<div style="padding:26px 20px; font-size:12px; color:var(--text-muted);">No broadcast data published for this channel today.</div>`;
          } else {
            progsHtml = progs
              .map((p) => {
                const left = (p.startMin - START_HOUR * 60) * PIXELS_PER_MIN;
                const width = Math.max((p.endMin - p.startMin) * PIXELS_PER_MIN - 3, 40);
                const isToday = state.dayOffset === 0;
                const isLive = isToday && nowMin >= p.startMin && nowMin < p.endMin;
                const isPast = isToday && nowMin >= p.endMin;

                return `
                  <button
                    class="epg-prog ${isLive ? "is-live" : ""} ${isPast ? "is-past" : ""}"
                    style="left:${left}px; width:${width}px;"
                    data-genre="${p.genre}"
                    data-prog-id="${p.id}"
                    data-channel-id="${ch.id}"
                    type="button"
                  >
                    <div class="prog-top-row">
                      <span class="prog-title">${p.title}</span>
                      ${isLive ? `<span class="mini-tag live">LIVE</span>` : p.isNew ? `<span class="mini-tag">NEW</span>` : ""}
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
                      <span>On Now ${getLiveStreamUrl(ch) ? `&bull; <a href="${getLiveStreamUrl(ch)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:#dc2626; font-weight:700; text-decoration:none;">&#9654; Watch Live &nearr;</a>` : ""}</span>
                      <span>${formatTime(current.startMin)} – ${formatTime(current.endMin)}</span>
                    </div>
                    <div class="nn-slot-title">${current.title}</div>
                    <div class="prog-bottom-row">${current.ep} &bull; ${current.genre}</div>
                    <div class="nn-progress-bar"><div class="nn-progress-fill" style="width:${pct}%"></div></div>
                  </div>`
                : ""
            }

            ${
              next
                ? `<div class="nn-slot" data-prog-id="${next.id}" data-channel-id="${ch.id}">
                    <div class="nn-slot-label">
                      <span>Up Next</span>
                      <span>${formatTime(next.startMin)} – ${formatTime(next.endMin)}</span>
                    </div>
                    <div class="nn-slot-title">${next.title}</div>
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

  function renderWhatToWatch() {
    const catalogue = getMergedCatalogue();
    const tvPicks = collectTvHighlights();

    // 0. Live Seasonal Spotlight (auto-updates by time of year)
    const seasonalEl = document.getElementById("wtwSeasonalSpotlight");
    if (seasonalEl) {
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
        for (let i = 0; i < maxLen && mixed.length < 6; i++) {
          if (ukLive[i]) mixed.push(ukLive[i]);
          if (plutoLive[i] && mixed.length < 6) mixed.push(plutoLive[i]);
          if (tubiLive[i] && mixed.length < 6) mixed.push(tubiLive[i]);
        }
        filteredLive = mixed;
      }

      const seasonalCards =
        state.seasonalSourceFilter === "pluto" || state.seasonalSourceFilter === "tubi" || state.seasonalSourceFilter === "uk"
          ? filteredLive.slice(0, 6)
          : [...filteredLive.slice(0, 6), ...streamSeasonal.slice(0, 3)].slice(0, 6);

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
    const platforms = ["All", "Netflix", "BBC iPlayer", "ITVX", "Channel 4", "Prime Video", "Disney+", "Apple TV+", "Sky / NOW", "Paramount+", "MUBI", "BFI Player"];
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

  function renderStreaming() {
    renderStreamingFilters();

    const catalogue = getMergedCatalogue();
    const featured = catalogue.find((item) => item.featured) || catalogue[0];
    el.streamingHero.innerHTML = `
      <div>
        <span class="hero-kicker">OnAir UK Editor's Pick &bull; ${featured.platform}</span>
        <h1 class="hero-title">${featured.title}</h1>
        <p class="hero-desc">${featured.desc}</p>
        <div class="hero-actions">
          <button class="btn-primary" data-stream-id="${featured.id}" type="button">Read Review &amp; Details</button>
          <button class="ghost-btn" data-toggle-wl-stream="${featured.id}" type="button">
            ${isInWatchlist(featured.id) ? "✓ In Watchlist" : "+ Add to Watchlist"}
          </button>
        </div>
      </div>
      <div class="hero-meta-box">
        <div class="info-label" style="color:rgba(255,255,255,0.7)">Critic Rating</div>
        <div style="font-size:20px; color:#fbbf24; margin-bottom:8px;">${formatStars(featured.rating)}</div>
        <div style="font-size:13px; color:rgba(255,255,255,0.9);">
          <strong>${featured.type}</strong> &bull; ${featured.seasons}<br />
          Genre: ${featured.genre} &bull; Age ${featured.age}
        </div>
      </div>
    `;

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
      items.sort((a, b) => b.rating - a.rating || b.year - a.year);
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
    return `
      <article class="stream-card" data-stream-id="${item.id}">
        <div class="stream-card-banner" style="background:${item.platformColor}"></div>
        <div class="stream-card-body">
          <div class="stream-card-top">
            <span class="platform-tag" style="background:${item.platformColor}">${item.platform}</span>
            <span class="star-rating" title="${item.rating} out of 5">${formatStars(item.rating)}</span>
          </div>
          <h3 class="stream-card-title">${item.title}</h3>
          <div class="stream-card-meta">${item.type} &bull; ${item.genre} &bull; ${item.seasons} &bull; ${item.year}</div>
          <p class="stream-card-desc">${item.desc}</p>
          <div class="stream-card-footer">
            <span class="mini-tag">Cert ${item.age}</span>
            <button class="pill-btn ${saved ? "is-active" : ""}" data-toggle-wl-stream="${item.id}" type="button">
              ${saved ? "✓ Saved" : "+ Watchlist"}
            </button>
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
      return JSON.parse(localStorage.getItem("onair_live_epg_v7") || "{}");
    } catch {
      return {};
    }
  }

  function getDayScheduleForSearch(ch, dayOffset, localCache) {
    const liveDay = liveEpgByDay.get(dayOffset);
    if (liveDay && Array.isArray(liveDay[ch.sid]) && liveDay[ch.sid].length) {
      return liveDay[ch.sid];
    }
    const dateStr = getSkyDateStrForOffset(dayOffset);
    const epgDay = localCache && localCache[`epg_${dateStr}`];
    if (epgDay && epgDay[ch.sid] && Array.isArray(epgDay[ch.sid].events) && epgDay[ch.sid].events.length) {
      return epgDay[ch.sid].events;
    }
    if (ch.plutoSlug && localCache && localCache[`pluto_${dateStr}`] && localCache[`pluto_${dateStr}`].schedules) {
      const ps = localCache[`pluto_${dateStr}`].schedules[ch.id];
      if (Array.isArray(ps) && ps.length) return ps;
    }
    if (ch.tubiId && localCache && localCache[`tubi_${dateStr}`] && localCache[`tubi_${dateStr}`].schedules) {
      const ts = localCache[`tubi_${dateStr}`].schedules[ch.id];
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
          (Array.isArray(list) ? list.slice(0, 6) : []).forEach((entry) => {
            const show = entry && entry.show;
            if (!show || !show.name) return;
            if (results.some((r) => r.title.toLowerCase() === show.name.toLowerCase())) return;
            const net = (show.network && show.network.name) || (show.webChannel && show.webChannel.name) || "Streaming / On Demand";
            const cleanSummary = (show.summary || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
              isLiveData: true
            });
          });
        }
      } catch {
        // Ignore offline/network error
      }
    }

    const final = results.slice(0, 8);
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
      const hour = Math.max(6, Math.floor((startMin || 360) / 60));
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

    const filterBar = document.getElementById("searchFilterBar");
    if (filterBar) {
      const tabs = [
        { id: "all", label: `All (${tvMatches.length + streamMatches.length})` },
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
          runSearch(el.searchInput.value || query);
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
          runSearch(el.searchInput.value || query);
        };
      }

      const syncBtn = document.getElementById("syncUpcomingSearchBtn");
      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.textContent = "Syncing...";
          syncBtn.disabled = true;
          const active = getFilteredChannels("All").slice(0, 60);
          for (let d = 1; d <= 6; d++) {
            await ensureSchedulesForChannels(active, d, false);
          }
          runSearch(el.searchInput.value || query);
          showToast("Upcoming 6 days synced for search");
        };
      }
    }

    let visibleTv = tvMatches;
    let visibleStream = streamMatches;
    if (state.searchFilter === "next") {
      visibleTv = liveAndUpcoming;
      visibleStream = [];
    } else if (state.searchFilter === "past") {
      visibleTv = pastMatches;
      visibleStream = [];
    } else if (state.searchFilter === "stream") {
      visibleTv = [];
    }

    const tvHtml = visibleTv
      .slice(0, 60)
      .map(({ prog, channel, dayOffset, status, whenLabel }) => {
        const chNum = channel.numbers[state.platform];
        const platLabel = chNum != null ? `${channel.name} (${chNum})` : channel.name;
        return `
        <article class="stream-card" data-prog-id="${prog.id}" data-channel-id="${channel.id}">
          <div class="stream-card-banner" style="background:${channel.color}"></div>
          <div class="stream-card-body">
            <div class="stream-card-top">
              <span class="platform-tag" style="background:${channel.color}">${platLabel}</span>
              <span class="mini-tag ${status === "live" ? "catchup" : ""}">${whenLabel}</span>
            </div>
            <h3 class="stream-card-title">${prog.title}</h3>
            <div class="stream-card-meta">${prog.ep || ""} &bull; ${prog.genre}</div>
            <p class="stream-card-desc">${prog.desc || ""}</p>
            <div class="stream-card-footer">
              <button class="chip-pill" type="button" data-jump-ch="${channel.id}" data-jump-day="${dayOffset}" data-jump-min="${prog.startMin}" onclick="event.stopPropagation();">Jump to Guide</button>
              <span style="font-size:12px; font-weight:600; color:var(--brand-red);">View Details &rarr;</span>
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

    if (!tvHtml && !streamHtml && q.length >= 2) {
      fetchLiveShowDirectoryMatches(query).then((dirItems) => {
        if (state.searchQuery !== q) return;
        if (!dirItems.length) {
          el.searchResultsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No programmes or streaming titles matched "${query}". Try "Sync Upcoming Days" above or switch filter.</div>`;
          return;
        }
        el.searchSummary.textContent = `Not on live UK TV (-7d..+6d), but found ${dirItems.length} show match(es) for "${query}"`;
        el.searchResultsGrid.innerHTML = dirItems.map(renderStreamCard).join("");
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
    const primary = WATCH_PLATFORMS[primaryPlatform];
    const isLiveNow = Boolean(liveOpts && liveOpts.isLive && liveOpts.liveUrl);
    const primaryHref = isLiveNow
      ? liveOpts.liveUrl
      : officialSite || (primary ? primary.url(q) : `https://www.justwatch.com/uk/search?q=${q}`);
    const primaryColor = isLiveNow ? "#dc2626" : (primary ? primary.color : "#0f4c5c");
    const primaryLabel = isLiveNow
      ? `Watch Live on ${liveOpts.channelName}`
      : primaryPlatform && primaryPlatform !== "Live TV" && primaryPlatform !== "On Demand"
      ? `Watch on ${primaryPlatform}`
      : "Find Where to Stream";

    const quickCheckList = ["BBC iPlayer", "ITVX", "Channel 4", "My5", "Pluto TV", "Tubi", "Netflix", "Prime Video", "Disney+", "Apple TV+", "Sky / NOW", "Paramount+", "MUBI", "discovery+"]
      .filter((name) => name !== primaryPlatform);

    return `
      <div class="watch-links-box">
        <div class="watch-links-title">${isLiveNow ? "Live Now &bull; Watch Live Stream" : "Where to Watch &amp; Direct Show Link"}</div>
        <div class="watch-primary-row">
          <a id="modalDirectWatchBtn" class="watch-launch-btn" style="background:${primaryColor}" href="${primaryHref}" target="_blank" rel="noopener">
            &#9654; ${isLiveNow ? primaryLabel : (officialSite ? `Watch "${cleanTitle}" Directly` : primaryLabel)} &nearr;
          </a>
          ${isLiveNow && liveOpts.liveUrl.startsWith("https://www.nowtv.com/") ? `<a class="watch-launch-btn" style="background:#0f172a" href="https://www.sky.com/watch/sky-go/all" target="_blank" rel="noopener">Sky Go &nearr;</a>` : ""}
          ${isLiveNow && primary ? `<a class="watch-launch-btn" style="background:${primary.color}" href="${officialSite || primary.url(q)}" target="_blank" rel="noopener">On Demand (${primaryPlatform}) &nearr;</a>` : ""}
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
      if (btn && !presetOpts.isLive && !currentOfficialSite && resolved.directUrl) {
        const cleanTitle = rawTitle.replace(/^Film:\s*/i, "").trim();
        btn.href = resolved.directUrl;
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
    });
  }

  // ========================================================================
  // Detail Modal
  // ========================================================================
  function openProgrammeModal(progId, channelId) {
    const ch = liveChannels.find((c) => c.id === channelId);
    const progs = getSchedule(channelId, state.dayOffset);
    const prog = progs ? progs.find((p) => p.id === progId) : null;
    if (!ch || !prog) return;

    const saved = isInWatchlist(prog.id);
    const hasRem = state.reminders.has(prog.id);
    const chNum = ch.numbers[state.platform];
    const nowMin = getNowMinutes();
    const isLive = state.dayOffset === 0 && nowMin >= prog.startMin && nowMin < prog.endMin;
    const liveUrl = isLive ? getLiveStreamUrl(ch) : null;

    el.modalBody.innerHTML = `
      <div id="modalHeaderWrap" class="${prog.image ? "modal-header-with-poster" : ""}">
        ${prog.image ? `<img class="modal-poster" src="${prog.image}" alt="${prog.title}" />` : ""}
        <div>
          <div class="modal-kicker">
            <span class="platform-tag" style="background:${ch.color}">${ch.name}${chNum ? ` &bull; Ch ${chNum}` : ""}</span>
            <span class="mini-tag">${prog.genre}</span>
            <span class="mini-tag">Cert ${prog.rating}</span>
            ${isLive ? `<span class="mini-tag live">LIVE NOW</span>` : prog.isLiveData ? `<span class="mini-tag catchup">LIVE EPG</span>` : prog.isNew ? `<span class="mini-tag live">NEW</span>` : ""}
          </div>
          <h2 id="modalTitle" class="modal-title">${prog.title}</h2>
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
          <span>${prog.cast}</span>
        </div>
        <div>
          <span class="info-label">Catch-Up &amp; Broadcast</span>
          <span>${ch.name} &bull; <strong>${ch.catchup}</strong></span>
        </div>
      </div>
      ${renderWhereToWatchBlock(prog.title, ch.catchup, prog.officialSite, isLive ? { isLive: true, liveUrl, channelName: ch.name } : null)}
      <div class="modal-actions">
        <button class="btn-primary" id="modalWatchlistBtn" type="button">
          ${saved ? "✓ Saved in Watchlist" : "+ Add to Watchlist"}
        </button>
        <button class="ghost-btn" id="modalReminderBtn" type="button">
          ${hasRem ? "🔔 Reminder Set" : "🔔 Set Reminder"}
        </button>
      </div>
    `;

    document.getElementById("modalWatchlistBtn").onclick = () => {
      toggleWatchlist({
        id: prog.id,
        kind: "tv",
        title: prog.title,
        subtitle: `${ch.name} (${formatTime(prog.startMin)})`,
        channelId: ch.id
      });
      openProgrammeModal(progId, channelId);
    };

    document.getElementById("modalReminderBtn").onclick = () => {
      if (state.reminders.has(prog.id)) {
        state.reminders.delete(prog.id);
        showToast(`Reminder removed for ${prog.title}`);
      } else {
        state.reminders.add(prog.id);
        showToast(`Reminder set for ${prog.title} at ${formatTime(prog.startMin)}`);
      }
      localStorage.setItem("rt_reminders", JSON.stringify([...state.reminders]));
      openProgrammeModal(progId, channelId);
    };

    el.detailModal.classList.remove("hidden");
    enrichModalDirectLink(prog.title, prog.officialSite, { isLive });
  }

  function openStreamModal(streamId) {
    const item = getMergedCatalogue().find((s) => s.id === streamId);
    if (!item) return;

    const saved = isInWatchlist(item.id);
    el.modalBody.innerHTML = `
      <div id="modalHeaderWrap" class="${item.image ? "modal-header-with-poster" : ""}">
        ${item.image ? `<img class="modal-poster" src="${item.image}" alt="${item.title}" />` : ""}
        <div>
          <div class="modal-kicker">
            <span class="platform-tag" style="background:${item.platformColor}">${item.platform}</span>
            <span class="mini-tag">${item.type}</span>
            <span class="mini-tag">${item.genre}</span>
            <span class="mini-tag">Cert ${item.age}</span>
            ${item.isLiveData ? `<span class="mini-tag catchup">LIVE SYNC</span>` : ""}
          </div>
          <h2 id="modalTitle" class="modal-title">${item.title}</h2>
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
          <span>${item.cast}</span>
        </div>
        <div>
          <span class="info-label">Primary Platform</span>
          <span>Streaming on <strong>${item.platform}</strong></span>
        </div>
      </div>
      ${renderWhereToWatchBlock(item.title, item.platform, item.officialSite)}
      <div class="modal-actions">
        <button class="btn-primary" id="modalWatchlistBtn" type="button">
          ${saved ? "✓ Saved in Watchlist" : "+ Add to Watchlist"}
        </button>
      </div>
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
    enrichModalDirectLink(item.title, item.officialSite, {
      imdbId: item.imdbId,
      imdbScore: item.imdbScore,
      rtSlug: item.rtSlug,
      rtScore: item.rtScore
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
    localStorage.setItem("rt_watchlist", JSON.stringify(state.watchlist));
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
        localStorage.setItem("rt_platform", state.platform);
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
        localStorage.setItem("rt_favorites", JSON.stringify([...state.favorites]));
        renderEPG();
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

  async function syncLiveData(force = false) {
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

      if (force) showToast("Live UK TV EPG & streaming feeds refreshed");
    } catch {
      el.liveStatusText.textContent = "Offline Mode";
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
            <strong>Seasonal Spotlight &amp; Filter</strong>
            <span>Auto-updates year-round by date, or preview any season anytime.</span>
          </div>
          <select id="settingSeasonSelect" class="settings-select">
            <option value="auto" ${state.seasonOverride === "auto" ? "selected" : ""}>Auto (${getAutoSeason().chip} · ${getAutoSeason().windowLabel})</option>
            ${SEASON_CALENDAR.map((s) => `<option value="${s.id}" ${state.seasonOverride === s.id ? "selected" : ""}>${s.chip} (${s.windowLabel})</option>`).join("")}
          </select>
        </div>

        <div class="settings-actions">
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
            <div class="storage-stat-val">${report.mergedShowsCount} <span style="font-size:13px; font-weight:500; color:var(--text-muted);">/ 5,000</span></div>
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
            <div class="storage-stat-val">${(Number(report.totalStorageKb) / 1024).toFixed(2)} MB <span style="font-size:13px; font-weight:500; color:var(--text-muted);">/ 5.00 MB</span></div>
            <div class="storage-stat-lbl">Browser localStorage Used</div>
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

    document.getElementById("settingSeasonSelect").onchange = (e) => {
      state.seasonOverride = e.target.value || "auto";
      localStorage.setItem("onair_season_override", state.seasonOverride);
      renderCategoryPills();
      showToast(`Seasonal spotlight set to ${state.seasonOverride === "auto" ? "Auto" : getActiveSeason().chip}`);
    };

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

    function addMsg(role, text, actions = []) {
      const div = document.createElement("div");
      div.className = `chat-msg ${role}`;
      div.innerHTML = text;
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

    function getLiveSummaryFor(platId, catId, dayOffset = 0, limit = 3) {
      const nowMin = getNowMinutes();
      const localCache = getCachedStoreForSearch();
      const chs = liveChannels.filter((c) => c.numbers[platId] != null);
      const picks = [];
      for (const ch of chs) {
        const progs = getDayScheduleForSearch(ch, dayOffset, localCache);
        if (!progs) continue;
        const target = dayOffset === 0
          ? progs.find((p) => nowMin >= p.startMin && nowMin < p.endMin) || progs.find((p) => p.startMin > nowMin)
          : progs.find((p) => p.startMin >= 18 * 60) || progs[0];
        if (!target) continue;
        if (catId && catId !== "All" && !progMatchesCategory(target, catId, ch.name)) continue;
        picks.push({ ch, prog: target });
        if (picks.length >= limit) break;
      }
      return picks;
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
        { re: /\bpluto\b/i, id: "pluto", name: "Pluto TV" },
        { re: /\btubi\b/i, id: "tubi", name: "Tubi" },
        { re: /\bsky\b/i, id: "sky", name: "Sky" },
        { re: /\bfreeview\b/i, id: "freeview", name: "Freeview" },
        { re: /\bvirgin\b/i, id: "virgin", name: "Virgin Media" },
        { re: /\b(bt|ee tv|ee)\b/i, id: "bt", name: "BT / EE TV" },
        { re: /\bfreesat\b/i, id: "freesat", name: "Freesat" }
      ];
      const matchedPlat = platMap.find((p) => p.re.test(lower));

      // 2. Detect category intent
      const catMap = [
        { re: /\b(christmas|xmas|festive|seasonal|halloween|easter|summer)\b/i, id: "Seasonal", label: getActiveSeason().chip },
        { re: /\b(sport|football|cricket|rugby|tennis|f1|boxing)\b/i, id: "Sport", label: "Sport" },
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

      // 3. Detect view intent
      let matchedView = null;
      if (/\b(what to watch|recommend|tonight'?s picks|picks)\b/i.test(lower)) matchedView = { id: "what-to-watch", label: "What to Watch" };
      else if (/\b(now & next|now and next|on now)\b/i.test(lower)) matchedView = { id: "now-next", label: "Now & Next" };
      else if (/\b(streaming|on demand|netflix|disney|prime)\b/i.test(lower)) matchedView = { id: "streaming", label: "Streaming" };
      else if (/\b(what'?s new|headlines|rss)\b/i.test(lower)) matchedView = { id: "whats-new", label: "What's New" };
      else if (/\b(settings|backup|vault|cache|diagnostics|health)\b/i.test(lower)) matchedView = { id: "settings", label: "Settings" };

      // 4. Detect day/time jump
      let dayJump = null;
      if (/\byesterday\b/i.test(lower)) dayJump = -1;
      else if (/\btomorrow\b/i.test(lower)) dayJump = 1;
      else if (/\btoday\b/i.test(lower)) dayJump = 0;

      let hourJump = null;
      if (/\b(primetime|evening|tonight)\b/i.test(lower)) hourJump = 20;
      else if (/\bmorning\b/i.test(lower)) hourJump = 8;
      else if (/\bafternoon\b/i.test(lower)) hourJump = 14;
      else if (/\blate\b/i.test(lower)) hourJump = 22;

      // 5. Check if it's a show/when-on-next lookup
      const stripped = q
        .replace(/^(when is|when'?s|what time is|where can i watch|search for|search|find|look up|is|watch)\s+/i, "")
        .replace(/\s+(on next|next on|on tv|playing|showing|tonight|today|tomorrow|on netflix|on iplayer|\?)+$/gi, "")
        .trim();

      const isExplicitNav =
        /^(open|go to|switch to|show me|take me to)\b/i.test(lower) ||
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
                .slice(0, 3)
                .map((m) => `<strong>${escapeHtml(m.prog.title)}</strong> &bull; ${m.whenLabel} on <strong>${escapeHtml(m.channel.name)}</strong>`)
                .join("<br/>")
            );
          } else if (pastOnes.length) {
            const last = pastOnes[0];
            lines.push(
              `No upcoming airings cached for <strong>${escapeHtml(last.prog.title)}</strong>.<br/>` +
              `${last.whenLabel} on <strong>${escapeHtml(last.channel.name)}</strong>`
            );
          }
          if (streamMatches.length) {
            const s0 = streamMatches[0];
            lines.push(`Streaming on <strong>${escapeHtml(s0.platform)}</strong>: ${escapeHtml(s0.title)}`);
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
          actions.push({
            label: "Open All Search Results",
            onClick: () => {
              el.searchInput.value = stripped;
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
          ? getLiveSummaryFor(state.platform, state.epgCategory, state.dayOffset, 3)
          : [];
        const previewHtml = preview.length
          ? `<br/><br/>` + preview.map((x) => `&bull; <strong>${escapeHtml(x.ch.name)}</strong>: ${escapeHtml(x.prog.title)} (${formatTime(x.prog.startMin)})`).join("<br/>")
          : "";

        addMsg("bot", `Moved you to <strong>${escapeHtml(parts.join(" · "))}</strong>.${previewHtml}`);
        return;
      }

      // Fallback: run global search across ahead & back days
      el.searchInput.value = stripped || q;
      runSearch(stripped || q);
      addMsg("bot", `Opened full Search across -7d..+6d, Show Vault &amp; UK On-Demand for <strong>"${escapeHtml(stripped || q)}"</strong>.`);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  function init() {
    applyTheme();
    renderPlatformPills();
    renderCategoryPills();
    renderDateStrip();
    renderWatchlist();
    renderEPG();
    bindEvents();
    initChatBot();

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
      if (state.view === "epg" && state.dayOffset === 0) renderEPG(false);
      else if (state.view === "now-next") renderNowNext(false);
      else if (state.view === "what-to-watch") renderWhatToWatch();
    }, 60 * 1000);
  }

  init();
})();
