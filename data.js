/* ==========================================================================
   OnAir UK — Full UK Broadcast Platforms, 60+ Channels, 7-Day EPG & Streaming
   ========================================================================== */

const ONAIR_DATA = (() => {
  const PLATFORMS = [
    { id: "freeview", name: "Freeview" },
    { id: "sky", name: "Sky" },
    { id: "virgin", name: "Virgin Media" },
    { id: "bt", name: "BT / EE TV" },
    { id: "freesat", name: "Freesat" }
  ];

  const CHANNEL_CATEGORIES = [
    "All",
    "Favorites",
    "Entertainment",
    "Drama",
    "Film",
    "Sport",
    "Documentary",
    "News",
    "Kids",
    "Music",
    "Radio"
  ];

  const INTEREST_CATEGORIES = [
    "Prestige Drama",
    "Crime & Thrillers",
    "Comedy & Sitcoms",
    "Sci-Fi & Fantasy",
    "World Cinema & International TV",
    "Cult Classics & Indie",
    "True Crime & Documentaries",
    "Blockbuster Films",
    "Live Sport",
    "Arts, History & Culture"
  ];

  // Comprehensive UK Channel Lineup (60+ channels) with platform-authentic numbering
  const CHANNELS = [
    // Mainstream Public Service
    { id: "bbc1", name: "BBC One", short: "BBC1", color: "#b91c1c", category: "Entertainment", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 1, sky: 101, virgin: 101, bt: 1, freesat: 101 } },
    { id: "bbc2", name: "BBC Two", short: "BBC2", color: "#0f766e", category: "Documentary", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 2, sky: 102, virgin: 102, bt: 2, freesat: 102 } },
    { id: "itv1", name: "ITV1", short: "ITV1", color: "#0369a1", category: "Entertainment", hd: true, catchup: "ITVX", numbers: { freeview: 3, sky: 103, virgin: 103, bt: 3, freesat: 103 } },
    { id: "ch4", name: "Channel 4", short: "C4", color: "#1d4ed8", category: "Entertainment", hd: true, catchup: "Channel 4", numbers: { freeview: 4, sky: 104, virgin: 104, bt: 4, freesat: 104 } },
    { id: "ch5", name: "5 (Channel 5)", short: "5", color: "#4338ca", category: "Documentary", hd: true, catchup: "My5", numbers: { freeview: 5, sky: 105, virgin: 105, bt: 5, freesat: 105 } },
    { id: "itv2", name: "ITV2", short: "ITV2", color: "#0284c7", category: "Entertainment", hd: true, catchup: "ITVX", numbers: { freeview: 6, sky: 118, virgin: 115, bt: 6, freesat: 113 } },
    { id: "bbc4", name: "BBC Four", short: "BBC4", color: "#334155", category: "Documentary", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 9, sky: 116, virgin: 107, bt: 9, freesat: 107 } },
    { id: "itv3", name: "ITV3", short: "ITV3", color: "#1e40af", category: "Drama", hd: true, catchup: "ITVX", numbers: { freeview: 10, sky: 119, virgin: 117, bt: 10, freesat: 115 } },
    { id: "sky-mix", name: "Sky Mix", short: "MIX", color: "#2563eb", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: 11, sky: 151, virgin: null, bt: 11, freesat: null } },
    { id: "e4", name: "E4", short: "E4", color: "#7e22ce", category: "Entertainment", hd: true, catchup: "Channel 4", numbers: { freeview: 13, sky: 135, virgin: 106, bt: 13, freesat: 122 } },
    { id: "film4", name: "Film4", short: "FILM4", color: "#991b1b", category: "Film", hd: true, catchup: "Channel 4", numbers: { freeview: 14, sky: 313, virgin: 428, bt: 14, freesat: 300 } },
    { id: "more4", name: "More4", short: "M4", color: "#0d9488", category: "Documentary", hd: true, catchup: "Channel 4", numbers: { freeview: 18, sky: 136, virgin: 147, bt: 18, freesat: 124 } },
    { id: "dave", name: "U&Dave", short: "DAVE", color: "#3f3f46", category: "Entertainment", hd: true, catchup: "U", numbers: { freeview: 19, sky: 111, virgin: 127, bt: 19, freesat: 157 } },
    { id: "udrama", name: "U&Drama", short: "DRAMA", color: "#9f1239", category: "Drama", hd: false, catchup: "U", numbers: { freeview: 20, sky: 143, virgin: 130, bt: 20, freesat: 158 } },
    { id: "bbc3", name: "BBC Three", short: "BBC3", color: "#db2777", category: "Entertainment", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 23, sky: 115, virgin: 108, bt: 23, freesat: 108 } },
    { id: "itv4", name: "ITV4", short: "ITV4", color: "#0f766e", category: "Sport", hd: true, catchup: "ITVX", numbers: { freeview: 26, sky: 120, virgin: 118, bt: 26, freesat: 117 } },
    { id: "uyesterday", name: "U&Yesterday", short: "YEST", color: "#854d0e", category: "Documentary", hd: false, catchup: "U", numbers: { freeview: 27, sky: 155, virgin: 129, bt: 27, freesat: 159 } },
    { id: "itvbe", name: "ITVBe", short: "ITVBe", color: "#be185d", category: "Entertainment", hd: false, catchup: "ITVX", numbers: { freeview: 28, sky: 131, virgin: 119, bt: 28, freesat: 118 } },
    { id: "e4extra", name: "E4 Extra", short: "E4X", color: "#6d28d9", category: "Entertainment", hd: false, catchup: "Channel 4", numbers: { freeview: 31, sky: 138, virgin: 146, bt: 31, freesat: 181 } },
    { id: "5star", name: "5STAR", short: "5STR", color: "#4f46e5", category: "Entertainment", hd: false, catchup: "My5", numbers: { freeview: 32, sky: 128, virgin: 151, bt: 32, freesat: 131 } },
    { id: "5usa", name: "5USA", short: "5USA", color: "#1d4ed8", category: "Drama", hd: false, catchup: "My5", numbers: { freeview: 21, sky: 141, virgin: 153, bt: 21, freesat: 129 } },
    { id: "5action", name: "5ACTION", short: "5ACT", color: "#b91c1c", category: "Film", hd: false, catchup: "My5", numbers: { freeview: 33, sky: 150, virgin: 150, bt: 33, freesat: 132 } },
    { id: "5select", name: "5SELECT", short: "5SEL", color: "#0369a1", category: "Documentary", hd: false, catchup: "My5", numbers: { freeview: 46, sky: 140, virgin: 152, bt: 46, freesat: 133 } },
    { id: "4seven", name: "4seven", short: "4SEV", color: "#2563eb", category: "Entertainment", hd: false, catchup: "Channel 4", numbers: { freeview: 49, sky: 137, virgin: 148, bt: 49, freesat: 127 } },
    { id: "quest", name: "Quest", short: "QUEST", color: "#0e7490", category: "Documentary", hd: true, catchup: "discovery+", numbers: { freeview: 12, sky: 144, virgin: 137, bt: 12, freesat: 167 } },
    { id: "legend", name: "LEGEND", short: "LGND", color: "#7c2d12", category: "Film", hd: false, catchup: "Watch Free UK", numbers: { freeview: 41, sky: 148, virgin: 149, bt: 41, freesat: 137 } },
    { id: "greatmovies", name: "GREAT! movies", short: "GRT!", color: "#be123c", category: "Film", hd: false, catchup: "GREAT! player", numbers: { freeview: 34, sky: 321, virgin: 424, bt: 34, freesat: 302 } },
    { id: "talkingpics", name: "Talking Pictures TV", short: "TPTV", color: "#475569", category: "Film", hd: false, catchup: "TPTV Encore", numbers: { freeview: 82, sky: 328, virgin: 445, bt: 82, freesat: 306 } },
    { id: "pbsamerica", name: "PBS America", short: "PBS", color: "#1e3a8a", category: "Documentary", hd: false, catchup: "Freeview Play", numbers: { freeview: 84, sky: 174, virgin: 187, bt: 84, freesat: 155 } },
    { id: "bbc-scotland", name: "BBC Scotland", short: "BBCS", color: "#0284c7", category: "Entertainment", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 108, sky: 115, virgin: 108, bt: 108, freesat: 106 } },
    { id: "bbc-alba", name: "BBC Alba", short: "ALBA", color: "#0f766e", category: "Documentary", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 7, sky: 117, virgin: 120, bt: 7, freesat: 109 } },

    // Sky / Virgin / BT Premium Entertainment & Drama
    { id: "sky-showcase", name: "Sky Showcase", short: "SHOW", color: "#0f172a", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 106, virgin: 109, bt: 339, freesat: null } },
    { id: "sky-witness", name: "Sky Witness", short: "WITN", color: "#4338ca", category: "Drama", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 107, virgin: 110, bt: 341, freesat: null } },
    { id: "sky-atlantic", name: "Sky Atlantic", short: "SKY A", color: "#111827", category: "Drama", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 108, virgin: null, bt: 342, freesat: null } },
    { id: "alibi", name: "U&Alibi", short: "ALIBI", color: "#881337", category: "Drama", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 109, virgin: 126, bt: 312, freesat: null } },
    { id: "gold", name: "U&Gold", short: "GOLD", color: "#ca8a04", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 110, virgin: 124, bt: 310, freesat: null } },
    { id: "comedy-central", name: "Comedy Central", short: "CC", color: "#ea580c", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 112, virgin: 132, bt: 306, freesat: null } },
    { id: "sky-max", name: "Sky Max", short: "MAX", color: "#2563eb", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 113, virgin: 111, bt: 340, freesat: null } },
    { id: "sky-comedy", name: "Sky Comedy", short: "SKYC", color: "#d97706", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 114, virgin: 112, bt: 343, freesat: null } },
    { id: "sky-crime", name: "Sky Crime", short: "CRIME", color: "#7f1d1d", category: "Documentary", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 121, virgin: 122, bt: 344, freesat: null } },
    { id: "sky-arts", name: "Sky Arts", short: "ARTS", color: "#6d28d9", category: "Documentary", hd: true, catchup: "NOW", numbers: { freeview: 36, sky: 130, virgin: 123, bt: 36, freesat: 147 } },
    { id: "sky-scifi", name: "Sky Sci-Fi", short: "SCIFI", color: "#1e293b", category: "Drama", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 152, virgin: 139, bt: 345, freesat: null } },
    { id: "uw", name: "U&W", short: "U&W", color: "#0d9488", category: "Entertainment", hd: true, catchup: "U", numbers: { freeview: 25, sky: 132, virgin: 125, bt: 25, freesat: 156 } },
    { id: "tlc", name: "TLC", short: "TLC", color: "#db2777", category: "Entertainment", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 133, virgin: 167, bt: 320, freesat: null } },
    { id: "mtv", name: "MTV", short: "MTV", color: "#0f172a", category: "Entertainment", hd: true, catchup: "Paramount+", numbers: { freeview: null, sky: 126, virgin: 134, bt: 308, freesat: null } },

    // Documentary Channels
    { id: "discovery", name: "Discovery Channel", short: "DISC", color: "#0369a1", category: "Documentary", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 125, virgin: 250, bt: 322, freesat: null } },
    { id: "natgeo", name: "National Geographic", short: "NATGEO", color: "#ca8a04", category: "Documentary", hd: true, catchup: "Disney+", numbers: { freeview: null, sky: 129, virgin: 266, bt: 317, freesat: null } },
    { id: "sky-docs", name: "Sky Documentaries", short: "DOCS", color: "#0f766e", category: "Documentary", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 123, virgin: 188, bt: 346, freesat: null } },
    { id: "sky-nature", name: "Sky Nature", short: "NAT", color: "#15803d", category: "Documentary", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 124, virgin: 189, bt: 347, freesat: null } },
    { id: "history", name: "Sky History", short: "HIST", color: "#78350f", category: "Documentary", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 122, virgin: 270, bt: 324, freesat: null } },

    // Sky Cinema
    { id: "sky-cinema", name: "Sky Cinema Premiere", short: "PREM", color: "#6b21a8", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 301, virgin: 401, bt: 500, freesat: null } },
    { id: "sky-cinema-hits", name: "Sky Cinema Hits", short: "HITS", color: "#7e22ce", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 303, virgin: 403, bt: 502, freesat: null } },
    { id: "sky-cinema-scifi", name: "Sky Cinema Sci-Fi & Horror", short: "SCIF", color: "#4c1d95", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 311, virgin: 411, bt: 510, freesat: null } },
    { id: "sky-cinema-fam", name: "Sky Cinema Family", short: "FAM", color: "#0284c7", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 306, virgin: 406, bt: 505, freesat: null } },

    // Sport
    { id: "sky-sports", name: "Sky Sports Main Event", short: "SSME", color: "#1e3a8a", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 401, virgin: 501, bt: 420, freesat: null } },
    { id: "sky-sports-pl", name: "Sky Sports Premier League", short: "SSPL", color: "#1d4ed8", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 402, virgin: 502, bt: 421, freesat: null } },
    { id: "sky-sports-f1", name: "Sky Sports F1", short: "SSF1", color: "#dc2626", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 406, virgin: 506, bt: 425, freesat: null } },
    { id: "sky-sports-crick", name: "Sky Sports Cricket", short: "SSCR", color: "#0f766e", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 404, virgin: 504, bt: 423, freesat: null } },
    { id: "tnt-sports", name: "TNT Sports 1", short: "TNT1", color: "#15803d", category: "Sport", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 410, virgin: 527, bt: 408, freesat: null } },
    { id: "tnt-sports2", name: "TNT Sports 2", short: "TNT2", color: "#166534", category: "Sport", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 411, virgin: 528, bt: 409, freesat: null } },
    { id: "eurosport1", name: "Eurosport 1", short: "EURO1", color: "#1e40af", category: "Sport", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 413, virgin: 521, bt: 412, freesat: null } },

    // News
    { id: "bbc-news", name: "BBC News", short: "NEWS", color: "#dc2626", category: "News", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 231, sky: 503, virgin: 601, bt: 231, freesat: 200 } },
    { id: "sky-news", name: "Sky News", short: "SKYN", color: "#b91c1c", category: "News", hd: true, catchup: "YouTube", numbers: { freeview: 233, sky: 501, virgin: 603, bt: 233, freesat: 202 } },
    { id: "gb-news", name: "GB News", short: "GBN", color: "#1d4ed8", category: "News", hd: true, catchup: "YouTube", numbers: { freeview: 236, sky: 512, virgin: 604, bt: 236, freesat: 216 } },

    // Kids
    { id: "cbbc", name: "CBBC", short: "CBBC", color: "#16a34a", category: "Kids", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 201, sky: 607, virgin: 701, bt: 201, freesat: 205 } },
    { id: "cbeebies", name: "CBeebies", short: "CBEEB", color: "#eab308", category: "Kids", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 202, sky: 608, virgin: 702, bt: 202, freesat: 206 } },
    { id: "nickelodeon", name: "Nickelodeon", short: "NICK", color: "#ea580c", category: "Kids", hd: true, catchup: "Paramount+", numbers: { freeview: null, sky: 604, virgin: 712, bt: 451, freesat: null } },
    { id: "cartoon-net", name: "Cartoon Network", short: "CN", color: "#18181b", category: "Kids", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 601, virgin: 704, bt: 450, freesat: null } },

    // Additional Full Sky EPG Channels (Entertainment & Documentaries)
    { id: "sky-one", name: "Sky One", short: "SKY1", color: "#1d4ed8", category: "Entertainment", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 106, virgin: 109, bt: 339, freesat: null } },
    { id: "cc-extra", name: "Comedy Central Extra", short: "CCX", color: "#c2410c", category: "Entertainment", hd: false, catchup: "NOW", numbers: { freeview: null, sky: 127, virgin: 133, bt: 307, freesat: null } },
    { id: "challenge", name: "Challenge", short: "CHAL", color: "#7c3aed", category: "Entertainment", hd: false, catchup: "Freeview Play", numbers: { freeview: 48, sky: 130, virgin: 139, bt: 48, freesat: 145 } },
    { id: "itv-quiz", name: "ITV Quiz", short: "ITVQ", color: "#0284c7", category: "Entertainment", hd: false, catchup: "ITVX", numbers: { freeview: 29, sky: 131, virgin: 119, bt: 29, freesat: 118 } },
    { id: "s4c", name: "S4C HD", short: "S4C", color: "#dc2626", category: "Entertainment", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 4, sky: 134, virgin: 166, bt: 4, freesat: 104 } },
    { id: "crime-inv", name: "Crime + Investigation", short: "C+I", color: "#7f1d1d", category: "Documentary", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 139, virgin: 121, bt: 328, freesat: null } },
    { id: "really", name: "Really", short: "REAL", color: "#0d9488", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: 17, sky: 142, virgin: 128, bt: 17, freesat: 160 } },
    { id: "food-net", name: "Food Network", short: "FOOD", color: "#dc2626", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: 43, sky: 144, virgin: 282, bt: 43, freesat: 148 } },
    { id: "true-crime", name: "True Crime", short: "TRUC", color: "#991b1b", category: "Documentary", hd: false, catchup: "Watch Free UK", numbers: { freeview: 67, sky: 146, virgin: 148, bt: 67, freesat: 143 } },
    { id: "true-crime-x", name: "True Crime Xtra", short: "TRUX", color: "#7f1d1d", category: "Documentary", hd: false, catchup: "Watch Free UK", numbers: { freeview: 68, sky: 147, virgin: null, bt: 68, freesat: 144 } },
    { id: "quest-red", name: "Quest Red", short: "QRED", color: "#be123c", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: 39, sky: 149, virgin: 170, bt: 39, freesat: 168 } },
    { id: "5drama", name: "5Drama", short: "5DRM", color: "#4f46e5", category: "Drama", hd: false, catchup: "My5", numbers: { freeview: 38, sky: 150, virgin: 152, bt: 38, freesat: 130 } },
    { id: "id-ch", name: "ID (Investigation Discovery)", short: "ID", color: "#1e293b", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: null, sky: 154, virgin: 171, bt: 325, freesat: null } },
    { id: "blaze", name: "BLAZE", short: "BLZE", color: "#ea580c", category: "Documentary", hd: false, catchup: "BLAZE", numbers: { freeview: 64, sky: 156, virgin: 174, bt: 64, freesat: 162 } },
    { id: "great-tv", name: "GREAT! TV", short: "GRTV", color: "#9333ea", category: "Drama", hd: false, catchup: "GREAT! player", numbers: { freeview: 50, sky: 157, virgin: 180, bt: 50, freesat: 142 } },
    { id: "disc-turbo", name: "Discovery Turbo", short: "TRBO", color: "#0369a1", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: null, sky: 158, virgin: 256, bt: 327, freesat: null } },
    { id: "dmax", name: "DMAX", short: "DMAX", color: "#1d4ed8", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: 37, sky: 159, virgin: 173, bt: 37, freesat: 165 } },
    { id: "disc-hist", name: "Discovery History", short: "DHIS", color: "#78350f", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: null, sky: 161, virgin: 254, bt: 326, freesat: null } },
    { id: "animal-planet", name: "Animal Planet", short: "ANIM", color: "#15803d", category: "Documentary", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 162, virgin: 258, bt: 329, freesat: null } },
    { id: "mysteryx", name: "MysteryX", short: "MYST", color: "#4c1d95", category: "Documentary", hd: false, catchup: "Sky", numbers: { freeview: null, sky: 163, virgin: null, bt: null, freesat: null } },
    { id: "natgeo-wild", name: "NatGeo Wild", short: "NGW", color: "#a16207", category: "Documentary", hd: true, catchup: "Disney+", numbers: { freeview: null, sky: 165, virgin: 268, bt: 318, freesat: null } },
    { id: "ueden", name: "U&Eden", short: "EDEN", color: "#166534", category: "Documentary", hd: true, catchup: "U", numbers: { freeview: 57, sky: 166, virgin: 245, bt: 57, freesat: 164 } },
    { id: "disc-sci", name: "Discovery Science", short: "DSCI", color: "#0e7490", category: "Documentary", hd: false, catchup: "discovery+", numbers: { freeview: null, sky: 167, virgin: 252, bt: 323, freesat: null } },
    { id: "together-tv", name: "Together TV", short: "TOG", color: "#0d9488", category: "Documentary", hd: false, catchup: "Freeview Play", numbers: { freeview: 83, sky: 170, virgin: 136, bt: 83, freesat: 164 } },
    { id: "travelxp", name: "Travelxp", short: "TRVL", color: "#0284c7", category: "Documentary", hd: true, catchup: "Freeview Play", numbers: { freeview: null, sky: 178, virgin: null, bt: null, freesat: null } },
    { id: "rewind-tv", name: "Rewind TV", short: "RWND", color: "#475569", category: "Entertainment", hd: false, catchup: "Freeview Play", numbers: { freeview: 95, sky: 182, virgin: null, bt: 95, freesat: null } },

    // Additional Sky Movies (302–323)
    { id: "sky-cine-xmas", name: "Sky Cinema Christmas", short: "XMAS", color: "#b91c1c", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 302, virgin: 402, bt: 501, freesat: null } },
    { id: "sky-cine-mummy", name: "Sky Cinema The Mummy", short: "MUMY", color: "#92400e", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 303, virgin: 403, bt: 502, freesat: null } },
    { id: "disney-cinema", name: "Disney+ Cinema", short: "DCIN", color: "#0063e5", category: "Film", hd: true, catchup: "Disney+", numbers: { freeview: null, sky: 305, virgin: 405, bt: 504, freesat: null } },
    { id: "sky-cine-act", name: "Sky Cinema Action", short: "ACTN", color: "#991b1b", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 306, virgin: 407, bt: 506, freesat: null } },
    { id: "sky-cine-greats", name: "Sky Cinema Greats", short: "GRTS", color: "#334155", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 307, virgin: 404, bt: 503, freesat: null } },
    { id: "sky-cine-com", name: "Sky Cinema Comedy", short: "COMD", color: "#d97706", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 308, virgin: 408, bt: 507, freesat: null } },
    { id: "sky-cine-thril", name: "Sky Cinema Thriller", short: "THRL", color: "#1e293b", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 309, virgin: 409, bt: 508, freesat: null } },
    { id: "sky-cine-dram", name: "Sky Cinema Drama", short: "DRAM", color: "#7e22ce", category: "Film", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 310, virgin: 410, bt: 509, freesat: null } },
    { id: "christmas24", name: "Christmas24", short: "X24", color: "#dc2626", category: "Film", hd: false, catchup: "NOW", numbers: { freeview: null, sky: 312, virgin: 419, bt: null, freesat: null } },
    { id: "film4-p1", name: "Film4+1", short: "F4+1", color: "#7f1d1d", category: "Film", hd: false, catchup: "Channel 4", numbers: { freeview: 47, sky: 314, virgin: 429, bt: 47, freesat: 301 } },
    { id: "legend-xtra", name: "Legend Xtra", short: "LGDX", color: "#9a3412", category: "Film", hd: false, catchup: "Watch Free UK", numbers: { freeview: 69, sky: 316, virgin: 149, bt: 69, freesat: 138 } },
    { id: "great-action", name: "GREAT! Action", short: "GACT", color: "#b91c1c", category: "Film", hd: false, catchup: "GREAT! player", numbers: { freeview: 42, sky: 318, virgin: 426, bt: 42, freesat: 304 } },
    { id: "great-mystery", name: "GREAT! Mystery", short: "GMYS", color: "#4338ca", category: "Film", hd: false, catchup: "GREAT! player", numbers: { freeview: 52, sky: 320, virgin: 425, bt: 52, freesat: 303 } },

    // Music Channels (354–358)
    { id: "clubland", name: "Clubland TV", short: "CLUB", color: "#db2777", category: "Music", hd: false, catchup: "Live", numbers: { freeview: null, sky: 354, virgin: null, bt: null, freesat: null } },
    { id: "now-70s", name: "NOW 70s", short: "N70s", color: "#d97706", category: "Music", hd: false, catchup: "Live", numbers: { freeview: 75, sky: 355, virgin: 345, bt: 75, freesat: null } },
    { id: "now-80s", name: "NOW 80s", short: "N80s", color: "#9333ea", category: "Music", hd: false, catchup: "Live", numbers: { freeview: 76, sky: 356, virgin: 346, bt: 76, freesat: null } },
    { id: "now-90s", name: "NOW 90s & 00s", short: "N90s", color: "#2563eb", category: "Music", hd: false, catchup: "Live", numbers: { freeview: null, sky: 357, virgin: 347, bt: null, freesat: null } },
    { id: "now-rock", name: "NOW Rock", short: "ROCK", color: "#18181b", category: "Music", hd: false, catchup: "Live", numbers: { freeview: null, sky: 358, virgin: 348, bt: null, freesat: null } },

    // Additional Sports Channels (403–493)
    { id: "sky-sports-fb", name: "Sky Sports Football", short: "SSFB", color: "#1e40af", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 403, virgin: 503, bt: 422, freesat: null } },
    { id: "sky-sports-plus", name: "Sky Sports+", short: "SS+", color: "#0f172a", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 404, virgin: 508, bt: 426, freesat: null } },
    { id: "sky-sports-golf", name: "Sky Sports Golf", short: "SSGF", color: "#15803d", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 406, virgin: 505, bt: 424, freesat: null } },
    { id: "sky-sports-ten", name: "Sky Sports Tennis", short: "SSTN", color: "#0d9488", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 408, virgin: 507, bt: 427, freesat: null } },
    { id: "sky-sports-news", name: "Sky Sports News", short: "SSN", color: "#b91c1c", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 409, virgin: 509, bt: 428, freesat: null } },
    { id: "sky-sports-nfl", name: "Sky Sports NFL", short: "SSNF", color: "#1e3a8a", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 412, virgin: 507, bt: 429, freesat: null } },
    { id: "tnt-sports3", name: "TNT Sports 3", short: "TNT3", color: "#15803d", category: "Sport", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 413, virgin: 529, bt: 410, freesat: null } },
    { id: "tnt-sports4", name: "TNT Sports 4", short: "TNT4", color: "#166534", category: "Sport", hd: true, catchup: "discovery+", numbers: { freeview: null, sky: 414, virgin: 530, bt: 411, freesat: null } },
    { id: "sky-sports-race", name: "Sky Sports Racing", short: "SSRC", color: "#0369a1", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 415, virgin: 535, bt: 430, freesat: null } },
    { id: "sky-sports-mix", name: "Sky Sports Mix", short: "SSMX", color: "#2563eb", category: "Sport", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 416, virgin: 510, bt: 431, freesat: null } },
    { id: "mutv", name: "MUTV", short: "MUTV", color: "#dc2626", category: "Sport", hd: true, catchup: "MUTV", numbers: { freeview: null, sky: 418, virgin: 526, bt: null, freesat: null } },
    { id: "premier-sp1", name: "Premier Sports 1", short: "PREM1", color: "#1d4ed8", category: "Sport", hd: true, catchup: "Premier Player", numbers: { freeview: null, sky: 419, virgin: 551, bt: null, freesat: null } },
    { id: "premier-sp2", name: "Premier Sports 2", short: "PREM2", color: "#1e40af", category: "Sport", hd: true, catchup: "Premier Player", numbers: { freeview: null, sky: 420, virgin: 552, bt: null, freesat: null } },
    { id: "lfctv", name: "LFCTV", short: "LFC", color: "#b91c1c", category: "Sport", hd: true, catchup: "LFCTV GO", numbers: { freeview: null, sky: 423, virgin: 544, bt: null, freesat: null } },
    { id: "racing-tv", name: "Racing TV", short: "RTV", color: "#0f766e", category: "Sport", hd: true, catchup: "Racing TV", numbers: { freeview: null, sky: 424, virgin: 536, bt: null, freesat: null } },

    // Additional News Channels (502–513)
    { id: "bloomberg", name: "Bloomberg TV", short: "BLMB", color: "#18181b", category: "News", hd: true, catchup: "Live", numbers: { freeview: null, sky: 502, virgin: 609, bt: null, freesat: 208 } },
    { id: "bbc-parl", name: "BBC Parliament", short: "PARL", color: "#6d28d9", category: "News", hd: true, catchup: "BBC iPlayer", numbers: { freeview: 232, sky: 504, virgin: 605, bt: 232, freesat: 201 } },
    { id: "cnbc", name: "CNBC Europe", short: "CNBC", color: "#1d4ed8", category: "News", hd: true, catchup: "Live", numbers: { freeview: null, sky: 505, virgin: 613, bt: null, freesat: 210 } },
    { id: "cnn", name: "CNN International", short: "CNN", color: "#dc2626", category: "News", hd: true, catchup: "Live", numbers: { freeview: null, sky: 506, virgin: 607, bt: null, freesat: 207 } },
    { id: "nhk-world", name: "NHK World", short: "NHK", color: "#0369a1", category: "News", hd: true, catchup: "Live", numbers: { freeview: null, sky: 507, virgin: 625, bt: null, freesat: 209 } },
    { id: "euronews", name: "Euronews", short: "EURO", color: "#0284c7", category: "News", hd: false, catchup: "Live", numbers: { freeview: null, sky: 508, virgin: 611, bt: null, freesat: 204 } },
    { id: "france24", name: "France 24 English", short: "F24", color: "#0063e5", category: "News", hd: true, catchup: "Live", numbers: { freeview: null, sky: 510, virgin: 624, bt: null, freesat: 205 } },
    { id: "aljazeera", name: "Al Jazeera English", short: "AJE", color: "#d97706", category: "News", hd: true, catchup: "Live", numbers: { freeview: 235, sky: 511, virgin: 622, bt: 235, freesat: 203 } },
    { id: "trt-world", name: "TRT World", short: "TRT", color: "#0f766e", category: "News", hd: true, catchup: "Live", numbers: { freeview: null, sky: 513, virgin: null, bt: null, freesat: 215 } },

    // Additional Kids Channels (603–623)
    { id: "boomerang", name: "Boomerang", short: "BOOM", color: "#0284c7", category: "Kids", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 603, virgin: 730, bt: 452, freesat: null } },
    { id: "nick-spongebob", name: "Nick SpongeBob", short: "SPNG", color: "#eab308", category: "Kids", hd: false, catchup: "Paramount+", numbers: { freeview: null, sky: 605, virgin: null, bt: null, freesat: null } },
    { id: "nick-jr", name: "Nick Jr", short: "NJR", color: "#ea580c", category: "Kids", hd: true, catchup: "Paramount+", numbers: { freeview: null, sky: 606, virgin: 715, bt: 453, freesat: null } },
    { id: "sky-kids", name: "Sky Kids", short: "SKID", color: "#2563eb", category: "Kids", hd: true, catchup: "NOW", numbers: { freeview: null, sky: 609, virgin: null, bt: null, freesat: null } },
    { id: "cartoonito", name: "Cartoonito", short: "CNTO", color: "#db2777", category: "Kids", hd: false, catchup: "NOW", numbers: { freeview: null, sky: 610, virgin: 706, bt: null, freesat: null } },
    { id: "disney-jr", name: "Disney Jr", short: "DJR", color: "#0063e5", category: "Kids", hd: true, catchup: "Disney+", numbers: { freeview: null, sky: 613, virgin: null, bt: null, freesat: null } },

    // Radio Channels (Sky 0101–0142)
    { id: "radio-1", name: "BBC Radio 1", short: "R1", color: "#18181b", category: "Radio", hd: false, catchup: "BBC Sounds", numbers: { freeview: 700, sky: 1010, virgin: 901, bt: 700, freesat: 700 } },
    { id: "radio-2", name: "BBC Radio 2", short: "R2", color: "#ea580c", category: "Radio", hd: false, catchup: "BBC Sounds", numbers: { freeview: 702, sky: 1020, virgin: 902, bt: 702, freesat: 702 } },
    { id: "radio-3", name: "BBC Radio 3", short: "R3", color: "#b91c1c", category: "Radio", hd: false, catchup: "BBC Sounds", numbers: { freeview: 703, sky: 1030, virgin: 903, bt: 703, freesat: 703 } },
    { id: "radio-4", name: "BBC Radio 4", short: "R4", color: "#1d4ed8", category: "Radio", hd: false, catchup: "BBC Sounds", numbers: { freeview: 704, sky: 1040, virgin: 904, bt: 704, freesat: 704 } },
    { id: "radio-5live", name: "BBC Radio 5 Live", short: "5L", color: "#0369a1", category: "Radio", hd: false, catchup: "BBC Sounds", numbers: { freeview: 705, sky: 1050, virgin: 905, bt: 705, freesat: 705 } },
    { id: "classic-fm", name: "Classic FM", short: "CLFM", color: "#7e22ce", category: "Radio", hd: false, catchup: "Global Player", numbers: { freeview: null, sky: 1060, virgin: 922, bt: null, freesat: 721 } },
    { id: "talksport", name: "talkSPORT", short: "TLKS", color: "#ca8a04", category: "Radio", hd: false, catchup: "talkSPORT", numbers: { freeview: 723, sky: 1070, virgin: 927, bt: 723, freesat: 731 } },
    { id: "lbc", name: "LBC", short: "LBC", color: "#dc2626", category: "Radio", hd: false, catchup: "Global Player", numbers: { freeview: 732, sky: 1210, virgin: 919, bt: 732, freesat: 734 } },
    { id: "radio-6music", name: "BBC Radio 6 Music", short: "6MUS", color: "#0f766e", category: "Radio", hd: false, catchup: "BBC Sounds", numbers: { freeview: 707, sky: 1180, virgin: 909, bt: 707, freesat: 707 } },
    { id: "times-radio", name: "Times Radio", short: "TIME", color: "#334155", category: "Radio", hd: false, catchup: "Times Radio", numbers: { freeview: null, sky: 1420, virgin: null, bt: null, freesat: null } }
  ];

  // Channel-specific schedules + category fallback templates
  const CHANNEL_TEMPLATES = {
    bbc1: [
      { dur: 180, title: "BBC Breakfast", genre: "News", rating: "G", ep: "Daily Live Edition", desc: "The latest news, sport, business and weather from the BBC Breakfast team.", cast: "Jon Kay, Sally Nugent" },
      { dur: 90, title: "Morning Live", genre: "Entertainment", rating: "G", ep: "Series 6", desc: "Topical magazine show featuring consumer advice, health tips and celebrity guests.", cast: "Gethin Jones, Michelle Ackerley" },
      { dur: 60, title: "Homes Under the Hammer", genre: "Documentary", rating: "G", ep: "Series 27", desc: "Following property developers as they renovate auction bargains.", cast: "Martin Roberts, Dion Dublin" },
      { dur: 45, title: "Bargain Hunt", genre: "Entertainment", rating: "G", ep: "Wrexham Special", desc: "Two teams compete to buy antiques and make a profit at auction.", cast: "Charlie Ross" },
      { dur: 45, title: "BBC News at One", genre: "News", rating: "G", ep: "Live Bulletin", desc: "National and international news from the BBC newsroom.", cast: "Anna Foster" },
      { dur: 60, title: "Doctors", genre: "Drama", rating: "PG", ep: "Series 25", desc: "Daily drama following the lives of the staff and patients at The Mill.", cast: "Ian Midlane, Dido Miles" },
      { dur: 90, title: "Escape to the Country", genre: "Documentary", rating: "G", ep: "Devon & Cornwall", desc: "Helping prospective buyers find their dream rural home.", cast: "Alistair Appleton" },
      { dur: 45, title: "Pointless", genre: "Entertainment", rating: "G", ep: "Series 31", desc: "General knowledge quiz where the lowest-scoring answers win.", cast: "Alexander Armstrong, Richard Osman" },
      { dur: 45, title: "BBC News at Six", genre: "News", rating: "G", ep: "Live", desc: "Evening news roundup with regional updates.", cast: "Sophie Raworth" },
      { dur: 30, title: "The One Show", genre: "Entertainment", rating: "G", ep: "Live Magazine", desc: "Topical stories and big-name studio guests from across the UK.", cast: "Alex Jones, Roman Kemp" },
      { dur: 30, title: "EastEnders", genre: "Drama", rating: "PG", ep: "Walford Drama", desc: "Tensions rise in Albert Square as a long-kept secret comes to light.", cast: "Steve McFadden, Gillian Taylforth" },
      { dur: 60, title: "Blue Lights", genre: "Drama", rating: "15", ep: "Series 2, Ep 4", desc: "Three rookie response officers navigate high-stakes policing in Belfast.", cast: "Siân Brooke, Martin McCann", stars: 5, new: true, interests: ["Crime & Thrillers", "Prestige Drama"] },
      { dur: 60, title: "The Graham Norton Show", genre: "Comedy", rating: "12", ep: "Series 32", desc: "A-list actors and musicians join Graham on the famous red sofa.", cast: "Graham Norton", stars: 4, interests: ["Comedy & Sitcoms"] },
      { dur: 45, title: "BBC News at Ten", genre: "News", rating: "G", ep: "Live", desc: "Comprehensive late-evening news and analysis.", cast: "Clive Myrie" },
      { dur: 105, title: "Match of the Day", genre: "Sport", rating: "G", ep: "Premier League Highlights", desc: "Full highlights and expert punditry from today's top-flight fixtures.", cast: "Gary Lineker, Alan Shearer", interests: ["Live Sport"] },
      { dur: 120, title: "Film: Belfast", genre: "Film", rating: "12", ep: "2021 Drama", desc: "Kenneth Branagh's Oscar-winning coming-of-age drama set in 1969 Northern Ireland.", cast: "Jude Hill, Caitríona Balfe", stars: 5, interests: ["Blockbuster Films", "Prestige Drama"] }
    ],
    bbc2: [
      { dur: 120, title: "Countryfile", genre: "Documentary", rating: "G", ep: "Lake District", desc: "Exploring rural issues and wildlife across the British countryside.", cast: "Matt Baker, Anita Rani" },
      { dur: 90, title: "Great British Railway Journeys", genre: "Documentary", rating: "G", ep: "York to Berwick", desc: "Tracing historic rail routes with Bradshaw's guide.", cast: "Michael Portillo", interests: ["Arts, History & Culture"] },
      { dur: 90, title: "The Supervet", genre: "Documentary", rating: "PG", ep: "Series 18", desc: "Pioneering orthopaedic veterinary care for beloved family pets.", cast: "Prof. Noel Fitzpatrick" },
      { dur: 120, title: "Classic Film: Brief Encounter", genre: "Film", rating: "PG", ep: "1945 Romance", desc: "David Lean's timeless tale of a fleeting romance at a railway station.", cast: "Celia Johnson, Trevor Howard", stars: 5, interests: ["Cult Classics & Indie"] },
      { dur: 60, title: "Flog It!", genre: "Entertainment", rating: "G", ep: "Bristol", desc: "Antiques valuations and auction room excitement.", cast: "Paul Martin" },
      { dur: 60, title: "Richard Osman's House of Games", genre: "Comedy", rating: "G", ep: "Champions Week", desc: "Four celebrities test their wits in offbeat trivia rounds.", cast: "Richard Osman", interests: ["Comedy & Sitcoms"] },
      { dur: 60, title: "Only Connect", genre: "Entertainment", rating: "G", ep: "Quarter-Final", desc: "Britain's toughest quiz challenges teams to find obscure connections.", cast: "Victoria Coren Mitchell", stars: 5 },
      { dur: 60, title: "University Challenge", genre: "Entertainment", rating: "G", ep: "Series 54", desc: "Academic teams go head-to-head under intense time pressure.", cast: "Amol Rajan" },
      { dur: 60, title: "Planet Earth III: Coasts", genre: "Documentary", rating: "G", ep: "Ep 3: Shores", desc: "Spectacular natural history photography revealing life along dangerous coastlines.", cast: "Sir David Attenborough", stars: 5, new: true, interests: ["True Crime & Documentaries", "Arts, History & Culture"] },
      { dur: 60, title: "Wolf Hall: The Mirror and the Light", genre: "Drama", rating: "15", ep: "Ep 2", desc: "Thomas Cromwell navigates the perilous Tudor court after Anne Boleyn's fall.", cast: "Mark Rylance, Damian Lewis", stars: 5, interests: ["Prestige Drama", "Arts, History & Culture"] },
      { dur: 45, title: "Newsnight", genre: "News", rating: "G", ep: "Live Debate", desc: "In-depth investigation and political debate.", cast: "Victoria Derbyshire" },
      { dur: 135, title: "Film: Drive My Car", genre: "Film", rating: "15", ep: "2021 Drama", desc: "A renowned stage actor directs a multilingual production of Uncle Vanya in Hiroshima.", cast: "Hidetoshi Nishijima", stars: 5, interests: ["World Cinema & International TV", "Cult Classics & Indie"] }
    ],
    itv1: [
      { dur: 180, title: "Good Morning Britain", genre: "News", rating: "G", ep: "Live", desc: "Breaking news, heated studio debates and weather.", cast: "Susanna Reid, Ed Balls" },
      { dur: 90, title: "This Morning", genre: "Entertainment", rating: "G", ep: "Live Lifestyle", desc: "Celebrity interviews, fashion, cooking and topical phone-ins.", cast: "Cat Deeley, Ben Shephard" },
      { dur: 90, title: "Loose Women", genre: "Entertainment", rating: "PG", ep: "Panel Discussion", desc: "Lively debate on the day's headlines and personal stories.", cast: "Ruth Langsford" },
      { dur: 60, title: "ITV Lunchtime News", genre: "News", rating: "G", ep: "Live", desc: "National and regional headlines.", cast: "Lucrezia Millarini" },
      { dur: 120, title: "Tipping Point", genre: "Entertainment", rating: "G", ep: "Series 14", desc: "Quiz contestants try to drop counters into the giant arcade machine.", cast: "Ben Shephard" },
      { dur: 60, title: "The Chase", genre: "Entertainment", rating: "G", ep: "Series 16", desc: "Four strangers team up to outrun one of Britain's finest quiz brains.", cast: "Bradley Walsh, Anne Hegerty" },
      { dur: 60, title: "ITV Evening News", genre: "News", rating: "G", ep: "Live", desc: "Comprehensive evening news bulletin.", cast: "Mary Nightingale" },
      { dur: 60, title: "Emmerdale", genre: "Drama", rating: "PG", ep: "Yorkshire Dales", desc: "A shock arrival in the village threatens to ruin a wedding.", cast: "Jeff Hordley" },
      { dur: 60, title: "Coronation Street", genre: "Drama", rating: "PG", ep: "Weatherfield", desc: "Secrets unravel on the cobbles as an investigation deepens.", cast: "Sally Dynevor" },
      { dur: 60, title: "Until I Kill You", genre: "Drama", rating: "15", ep: "Ep 3 of 4", desc: "Gripping true-crime drama starring Anna Maxwell Martin and Shaun Evans.", cast: "Anna Maxwell Martin, Shaun Evans", stars: 4, new: true, interests: ["Crime & Thrillers", "True Crime & Documentaries"] },
      { dur: 60, title: "The 1% Club", genre: "Entertainment", rating: "G", ep: "Series 3", desc: "Logic-based quiz where questions get harder until only 1% of the nation could answer.", cast: "Lee Mack", stars: 4, interests: ["Comedy & Sitcoms"] },
      { dur: 120, title: "Film: No Time to Die", genre: "Film", rating: "12", ep: "2021 Action", desc: "James Bond comes out of retirement in Jamaica to confront a dangerous new threat.", cast: "Daniel Craig, Léa Seydoux", stars: 4, interests: ["Blockbuster Films"] }
    ],
    ch4: [
      { dur: 120, title: "Everybody Loves Raymond", genre: "Comedy", rating: "G", ep: "Double Bill", desc: "Classic sitcom following sportswriter Ray Barone.", cast: "Ray Romano" },
      { dur: 120, title: "Frasier", genre: "Comedy", rating: "G", ep: "Classic Episodes", desc: "Dr Frasier Crane hosts his Seattle radio psychiatry show.", cast: "Kelsey Grammer, David Hyde Pierce", interests: ["Comedy & Sitcoms"] },
      { dur: 120, title: "Countdown", genre: "Entertainment", rating: "G", ep: "Letters & Numbers", desc: "The iconic words and numbers puzzle challenge.", cast: "Colin Murray, Rachel Riley" },
      { dur: 180, title: "A Place in the Sun", genre: "Documentary", rating: "G", ep: "Costa Blanca", desc: "House hunters search for an affordable holiday home abroad.", cast: "Jasmine Harman" },
      { dur: 120, title: "The Simpsons", genre: "Comedy", rating: "PG", ep: "Springfield Classic", desc: "Homer accidentally becomes Springfield's safety inspector.", cast: "Dan Castellaneta" },
      { dur: 60, title: "Channel 4 News", genre: "News", rating: "G", ep: "Live", desc: "In-depth journalism and international reporting.", cast: "Krishnan Guru-Murthy" },
      { dur: 60, title: "The Great British Bake Off", genre: "Entertainment", rating: "G", ep: "Patisserie Week", desc: "Bakers tackle delicate tarts and towering mille-feuille.", cast: "Noel Fielding, Alison Hammond", stars: 5, new: true },
      { dur: 60, title: "Taskmaster", genre: "Comedy", rating: "15", ep: "Series 18", desc: "Five comedians complete absurd tasks for Greg Davies's golden head.", cast: "Greg Davies, Alex Horne", stars: 5, interests: ["Comedy & Sitcoms"] },
      { dur: 60, title: "Gogglebox", genre: "Entertainment", rating: "12", ep: "Weekly Highlights", desc: "Britain's sharpest armchair critics react to the week's biggest TV moments.", cast: "Craig Cash (narrator)", stars: 4 },
      { dur: 120, title: "Film: Everything Everywhere All at Once", genre: "Film", rating: "15", ep: "2022 Sci-Fi", desc: "A laundromat owner discovers she must connect with parallel-universe versions of herself.", cast: "Michelle Yeoh, Ke Huy Quan", stars: 5, interests: ["Sci-Fi & Fantasy", "Cult Classics & Indie", "Blockbuster Films"] }
    ],
    "sky-atlantic": [
      { dur: 120, title: "The Sopranos", genre: "Drama", rating: "18", ep: "Series 4", desc: "Tony Soprano balances family life with leadership of the New Jersey mob.", cast: "James Gandolfini", stars: 5, interests: ["Prestige Drama", "Crime & Thrillers"] },
      { dur: 120, title: "True Detective", genre: "Drama", rating: "18", ep: "Season 1", desc: "Detectives Rust Cohle and Marty Hart revisit a chilling Louisiana case.", cast: "Matthew McConaughey, Woody Harrelson", stars: 5, interests: ["Crime & Thrillers", "Prestige Drama"] },
      { dur: 120, title: "Succession", genre: "Drama", rating: "15", ep: "Season 4", desc: "The Roy siblings battle for control of Waystar RoyCo.", cast: "Brian Cox, Jeremy Strong", stars: 5, interests: ["Prestige Drama"] },
      { dur: 120, title: "The Last of Us", genre: "Drama", rating: "15", ep: "Season 1", desc: "Joel and Ellie cross a devastated America in search of hope.", cast: "Pedro Pascal, Bella Ramsey", stars: 5, interests: ["Sci-Fi & Fantasy", "Prestige Drama"] },
      { dur: 90, title: "The Day of the Jackal", genre: "Drama", rating: "15", ep: "Ep 5 (New)", desc: "An elusive assassin is pursued across Europe by a relentless intelligence officer.", cast: "Eddie Redmayne, Lashana Lynch", stars: 5, new: true, interests: ["Crime & Thrillers", "Prestige Drama"] },
      { dur: 90, title: "House of the Dragon", genre: "Drama", rating: "18", ep: "Season 2", desc: "Targaryen civil war engulfs Westeros as dragons take to the skies.", cast: "Emma D'Arcy, Matt Smith", stars: 4, interests: ["Sci-Fi & Fantasy", "Prestige Drama"] },
      { dur: 90, title: "The Penguin", genre: "Drama", rating: "18", ep: "Ep 6", desc: "Oz Cobb seizes power in Gotham's fractured criminal underworld.", cast: "Colin Farrell, Cristin Milioti", stars: 5, interests: ["Crime & Thrillers", "Prestige Drama"] },
      { dur: 150, title: "The White Lotus", genre: "Comedy", rating: "15", ep: "Sicily", desc: "Wealthy holidaymakers unravel at a luxury Italian resort.", cast: "Jennifer Coolidge", stars: 5, interests: ["Prestige Drama", "Comedy & Sitcoms"] },
      { dur: 180, title: "Gomorrah", genre: "Drama", rating: "18", ep: "Italian Crime Drama", desc: "Inside the ruthless Camorra crime syndicate in Naples.", cast: "Marco D'Amore", stars: 5, interests: ["World Cinema & International TV", "Crime & Thrillers"] }
    ],
    film4: [
      { dur: 120, title: "Film: Paddington 2", genre: "Film", rating: "G", ep: "2017 Family", desc: "Paddington takes on odd jobs to buy Aunt Lucy a pop-up book.", cast: "Ben Whishaw, Hugh Grant", stars: 5, interests: ["Blockbuster Films"] },
      { dur: 120, title: "Film: The Sound of Music", genre: "Film", rating: "G", ep: "1965 Musical", desc: "Maria brings joy and music to the von Trapp household.", cast: "Julie Andrews", stars: 5 },
      { dur: 120, title: "Film: Knives Out", genre: "Film", rating: "12", ep: "2019 Mystery", desc: "Detective Benoit Blanc investigates the death of a wealthy crime novelist.", cast: "Daniel Craig, Ana de Armas", stars: 5, interests: ["Crime & Thrillers", "Blockbuster Films"] },
      { dur: 150, title: "Film: Dune", genre: "Film", rating: "12", ep: "2021 Sci-Fi", desc: "Paul Atreides journeys to the dangerous desert planet Arrakis.", cast: "Timothée Chalamet, Rebecca Ferguson", stars: 5, interests: ["Sci-Fi & Fantasy", "Blockbuster Films"] },
      { dur: 150, title: "Film: Parasite", genre: "Film", rating: "15", ep: "2019 Thriller", desc: "The Kim family schemes to infiltrate a wealthy Seoul household.", cast: "Song Kang-ho", stars: 5, interests: ["World Cinema & International TV", "Crime & Thrillers"] },
      { dur: 150, title: "Film: Amélie", genre: "Film", rating: "15", ep: "2001 French Comedy", desc: "A shy waitress in Montmartre decides to secretly improve the lives of those around her.", cast: "Audrey Tautou", stars: 5, interests: ["World Cinema & International TV", "Cult Classics & Indie"] },
      { dur: 180, title: "Film: Alien", genre: "Film", rating: "15", ep: "1979 Sci-Fi Horror", desc: "The crew of the Nostromo encounter a deadly extraterrestrial organism.", cast: "Sigourney Weaver", stars: 5, interests: ["Sci-Fi & Fantasy", "Cult Classics & Indie"] },
      { dur: 90, title: "Film: Portrait of a Lady on Fire", genre: "Film", rating: "15", ep: "2019 French Drama", desc: "On an isolated island in Brittany, a female painter is obliged to paint a wedding portrait.", cast: "Noémie Merlant, Adèle Haenel", stars: 5, interests: ["World Cinema & International TV", "Prestige Drama"] }
    ]
  };

  // Generic rich schedules by channel category for all remaining 50+ channels
  const CATEGORY_FALLBACK_TEMPLATES = {
    Entertainment: [
      { dur: 180, title: "Morning Classics & Sitcoms", genre: "Comedy", rating: "PG", ep: "Triple Bill", desc: "Back-to-back fan-favourite comedy and entertainment.", cast: "Various" },
      { dur: 180, title: "Afternoon Entertainment", genre: "Entertainment", rating: "PG", ep: "Showcase", desc: "Popular daytime lifestyle, quiz and panel shows.", cast: "Various" },
      { dur: 120, title: "Early Evening Comedy Hour", genre: "Comedy", rating: "12", ep: "Double Bill", desc: "Classic British and US sitcom favourites.", cast: "Ensemble Cast", interests: ["Comedy & Sitcoms"] },
      { dur: 120, title: "Primetime Entertainment Special", genre: "Entertainment", rating: "12", ep: "Tonight's Highlight", desc: "Flagship evening entertainment, panel games and celebrity guests.", cast: "Various", stars: 4 },
      { dur: 120, title: "Late Night Stand-Up & Cult Hits", genre: "Comedy", rating: "15", ep: "Uncut", desc: "Sharp late-night comedy and cult archive gems.", cast: "Various", interests: ["Comedy & Sitcoms", "Cult Classics & Indie"] },
      { dur: 180, title: "Overnight Encore", genre: "Entertainment", rating: "12", ep: "Replay", desc: "Missed it earlier? Catch tonight's biggest moments.", cast: "Various" }
    ],
    Drama: [
      { dur: 180, title: "Morning Detective Mysteries", genre: "Drama", rating: "PG", ep: "Double Bill", desc: "Classic whodunnits and cosy crime investigations.", cast: "Ensemble Cast", interests: ["Crime & Thrillers"] },
      { dur: 180, title: "Afternoon Period & Legal Drama", genre: "Drama", rating: "12", ep: "Series Catch-Up", desc: "Gripping courtroom battles and historical drama.", cast: "Various", interests: ["Prestige Drama"] },
      { dur: 120, title: "Early Evening Crime Files", genre: "Drama", rating: "12", ep: "Feature Episode", desc: "Cold cases and forensic breakthroughs.", cast: "Various", interests: ["Crime & Thrillers"] },
      { dur: 120, title: "Primetime Drama Series", genre: "Drama", rating: "15", ep: "New Episode", desc: "High-stakes evening drama and suspense.", cast: "Lead Cast", stars: 4, new: true, interests: ["Prestige Drama", "Crime & Thrillers"] },
      { dur: 120, title: "Late Night Thriller", genre: "Drama", rating: "18", ep: "Boxset Highlight", desc: "Dark psychological drama and noir mysteries.", cast: "Various", interests: ["Crime & Thrillers"] },
      { dur: 180, title: "Overnight Drama Marathon", genre: "Drama", rating: "15", ep: "Triple Bill", desc: "Continuous episodes from acclaimed drama series.", cast: "Various" }
    ],
    Film: [
      { dur: 150, title: "Film: Matinee Classic", genre: "Film", rating: "PG", ep: "Golden Era Cinema", desc: "Timeless silver-screen favourite.", cast: "Classic Stars", stars: 4, interests: ["Cult Classics & Indie"] },
      { dur: 150, title: "Film: Afternoon Adventure", genre: "Film", rating: "12", ep: "Action & Thriller", desc: "High-energy Hollywood entertainment.", cast: "Ensemble Cast", stars: 4, interests: ["Blockbuster Films"] },
      { dur: 150, title: "Film: Early Evening Family Hit", genre: "Film", rating: "PG", ep: "Box Office Hit", desc: "Crowd-pleasing cinema for everyone.", cast: "Various", stars: 4, interests: ["Blockbuster Films"] },
      { dur: 150, title: "Film: Primetime Premiere", genre: "Film", rating: "15", ep: "Tonight's Big Film", desc: "Critically acclaimed feature presentation.", cast: "A-List Cast", stars: 5, new: true, interests: ["Blockbuster Films", "Prestige Drama"] },
      { dur: 150, title: "Film: Late Night Cult Feature", genre: "Film", rating: "18", ep: "Director's Cut", desc: "Boundary-pushing genre cinema and cult favourites.", cast: "Various", stars: 4, interests: ["Cult Classics & Indie", "Sci-Fi & Fantasy"] },
      { dur: 150, title: "Film: Midnight Screening", genre: "Film", rating: "15", ep: "World & Indie", desc: "Handpicked late-night cinema.", cast: "Various", interests: ["World Cinema & International TV", "Cult Classics & Indie"] }
    ],
    Sport: [
      { dur: 180, title: "Morning Sports Briefing & Highlights", genre: "Sport", rating: "G", ep: "Live", desc: "Overnight results, highlights and breaking sports news.", cast: "Studio Pundits", interests: ["Live Sport"] },
      { dur: 180, title: "Afternoon Live Coverage", genre: "Sport", rating: "G", ep: "Live Event", desc: "Full live broadcast with pitchside reporters.", cast: "Commentators", stars: 4, interests: ["Live Sport"] },
      { dur: 180, title: "Primetime Live Match / Race", genre: "Sport", rating: "G", ep: "Live Action", desc: "Headline live sporting clash with full build-up.", cast: "Expert Panel", stars: 5, new: true, interests: ["Live Sport"] },
      { dur: 180, title: "Evening Analysis & Debate", genre: "Sport", rating: "G", ep: "Post-Match", desc: "Tactical breakdown and manager interviews.", cast: "Studio Panel", interests: ["Live Sport"] },
      { dur: 180, title: "Classic Sporting Moments", genre: "Sport", rating: "G", ep: "Archive Gold", desc: "Relive unforgettable finals and title deciders.", cast: "Archive", interests: ["Live Sport"] }
    ],
    Documentary: [
      { dur: 180, title: "Morning Natural World", genre: "Documentary", rating: "G", ep: "Wildlife Special", desc: "Exploring extraordinary habitats and animal behaviour.", cast: "Naturalists", interests: ["True Crime & Documentaries"] },
      { dur: 180, title: "Afternoon History & Engineering", genre: "Documentary", rating: "G", ep: "Archive & Discovery", desc: "Uncovering ancient civilisations and modern megastructures.", cast: "Historians", interests: ["Arts, History & Culture"] },
      { dur: 180, title: "Early Evening Science & Travel", genre: "Documentary", rating: "PG", ep: "Expedition", desc: "Journeys across remote landscapes and cosmic frontiers.", cast: "Explorers", interests: ["True Crime & Documentaries"] },
      { dur: 120, title: "Primetime Feature Documentary", genre: "Documentary", rating: "12", ep: "New Special", desc: "Deep-dive investigative and cultural documentary.", cast: "Documentary", stars: 5, new: true, interests: ["True Crime & Documentaries", "Arts, History & Culture"] },
      { dur: 120, title: "True Crime Investigation", genre: "Documentary", rating: "15", ep: "Case Files", desc: "Detectives and journalists revisit baffling real-life cases.", cast: "Investigators", stars: 4, interests: ["True Crime & Documentaries", "Crime & Thrillers"] },
      { dur: 180, title: "Overnight Factual", genre: "Documentary", rating: "PG", ep: "Repeat", desc: "Acclaimed factual series.", cast: "Various" }
    ],
    News: [
      { dur: 360, title: "Morning & Daytime Live News", genre: "News", rating: "G", ep: "Rolling Coverage", desc: "Breaking UK and world news, markets and weather.", cast: "Newsroom Team" },
      { dur: 360, title: "Afternoon & Evening News Hour", genre: "News", rating: "G", ep: "Live", desc: "Live Westminster briefings, global correspondents and interviews.", cast: "Anchors" },
      { dur: 360, title: "Late Night Headlines & Paper Review", genre: "News", rating: "G", ep: "Live", desc: "Tomorrow's front pages and overnight international updates.", cast: "Newsroom Team" }
    ],
    Kids: [
      { dur: 180, title: "Morning Animated Adventures", genre: "Kids", rating: "G", ep: "Fun & Learning", desc: "Bright animated favourites to start the day.", cast: "Voice Cast" },
      { dur: 180, title: "Afternoon Family Cartoons", genre: "Kids", rating: "G", ep: "Double Bill", desc: "Comedy and adventure for young viewers.", cast: "Voice Cast" },
      { dur: 180, title: "After-School Favourites", genre: "Kids", rating: "G", ep: "New Episodes", desc: "Popular series, quizzes and comedy.", cast: "Presenters" },
      { dur: 180, title: "Bedtime Stories & Wind-Down", genre: "Kids", rating: "G", ep: "Calm Evening", desc: "Gentle stories and soothing animation before bed.", cast: "Storytellers" },
      { dur: 180, title: "Overnight Closedown", genre: "Kids", rating: "G", ep: "Off Air", desc: "Returns at 6:00am.", cast: "—" }
    ],
    Music: [
      { dur: 240, title: "Morning Anthems & Breakfast Hits", genre: "Entertainment", rating: "G", ep: "Non-Stop Videos", desc: "Wall-to-wall classic and chart music videos to start the day.", cast: "Various Artists" },
      { dur: 240, title: "Afternoon Throwbacks & Top 40", genre: "Entertainment", rating: "G", ep: "Countdown", desc: "Iconic music videos and themed decade blocks.", cast: "Various Artists" },
      { dur: 240, title: "Evening Floorfillers & Live Sessions", genre: "Entertainment", rating: "PG", ep: "Party Mix", desc: "Biggest dance, rock and pop anthems.", cast: "Various Artists" },
      { dur: 360, title: "Late Night Chill & Classics", genre: "Entertainment", rating: "PG", ep: "After Hours", desc: "Continuous late-night music videos.", cast: "Various Artists" }
    ],
    Radio: [
      { dur: 240, title: "Breakfast Show", genre: "Entertainment", rating: "G", ep: "Live Radio", desc: "Morning music, news headlines, travel and conversation.", cast: "Breakfast Presenters" },
      { dur: 240, title: "Mid-Morning & Afternoon Live", genre: "Entertainment", rating: "G", ep: "Live Radio", desc: "Live guests, phone-ins, sport and music.", cast: "Daytime Presenters" },
      { dur: 240, title: "Drivetime & Evening Specialist", genre: "News", rating: "G", ep: "Live Radio", desc: "Evening news, debate and specialist music sessions.", cast: "Evening Presenters" },
      { dur: 360, title: "Late Night & Overnight Live", genre: "Entertainment", rating: "G", ep: "Live Radio", desc: "Relaxed late-night talk and music.", cast: "Overnight Team" }
    ]
  };

  // Curated Streaming & What-To-Watch Catalogue
  const STREAMING_CATALOGUE = [
    {
      id: "st-slow-horses",
      title: "Slow Horses",
      platform: "Apple TV+",
      platformColor: "#1d1d1f",
      type: "TV Series",
      genre: "Thriller",
      year: 2024,
      seasons: "4 Seasons",
      rating: 5,
      age: "15",
      featured: true,
      thisWeek: false,
      imdbScore: "8.2",
      imdbId: "tt5875444",
      rtScore: "98%",
      rtSlug: "tv/slow_horses",
      interests: ["Crime & Thrillers", "Prestige Drama"],
      cast: "Gary Oldman, Jack Lowden, Kristin Scott Thomas",
      desc: "MI5's Slough House misfits, led by the brilliantly cynical Jackson Lamb, stumble into high-stakes espionage conspiracies across London."
    },
    {
      id: "st-ripley",
      title: "Ripley",
      platform: "Netflix",
      platformColor: "#e50914",
      type: "TV Series",
      genre: "Thriller",
      year: 2024,
      seasons: "Limited Series",
      rating: 5,
      age: "15",
      thisWeek: false,
      imdbScore: "8.1",
      imdbId: "tt11016042",
      rtScore: "86%",
      rtSlug: "tv/ripley",
      interests: ["Crime & Thrillers", "Prestige Drama"],
      cast: "Andrew Scott, Dakota Fanning, Johnny Flynn",
      desc: "Shot in luminous black-and-white, Andrew Scott stars as grifter Tom Ripley in 1960s Italy."
    },
    {
      id: "st-shogun",
      title: "Shōgun",
      platform: "Disney+",
      platformColor: "#0063e5",
      type: "TV Series",
      genre: "Drama",
      year: 2024,
      seasons: "1 Season (10 eps)",
      rating: 5,
      age: "18",
      thisWeek: false,
      imdbScore: "8.6",
      imdbId: "tt2788316",
      rtScore: "99%",
      rtSlug: "tv/shogun_2024",
      interests: ["Prestige Drama", "World Cinema & International TV", "Arts, History & Culture"],
      cast: "Hiroyuki Sanada, Cosmo Jarvis, Anna Sawai",
      desc: "Set in feudal Japan in 1600, Lord Yoshii Toranaga fights for survival as a mysterious European ship washes ashore."
    },
    {
      id: "st-ludwig",
      title: "Ludwig",
      platform: "BBC iPlayer",
      platformColor: "#ff4c98",
      type: "TV Series",
      genre: "Comedy",
      year: 2024,
      seasons: "1 Season (6 eps)",
      rating: 5,
      age: "12",
      thisWeek: false,
      imdbScore: "8.1",
      imdbId: "tt27846061",
      rtScore: "96%",
      rtSlug: "tv/ludwig",
      interests: ["Comedy & Sitcoms", "Crime & Thrillers"],
      cast: "David Mitchell, Anna Maxwell Martin",
      desc: "Reclusive puzzle setter John Taylor assumes his missing twin brother's identity as a Cambridge police detective."
    },
    {
      id: "st-severance",
      title: "Severance",
      platform: "Apple TV+",
      platformColor: "#1d1d1f",
      type: "TV Series",
      genre: "Sci-Fi",
      year: 2025,
      seasons: "2 Seasons",
      rating: 5,
      age: "15",
      thisWeek: false,
      imdbScore: "8.7",
      imdbId: "tt11280740",
      rtScore: "97%",
      rtSlug: "tv/severance",
      interests: ["Sci-Fi & Fantasy", "Prestige Drama", "Cult Classics & Indie"],
      cast: "Adam Scott, Britt Lower, Patricia Arquette",
      desc: "Lumon Industries employees have their work and personal memories surgically separated—until the walls begin to crack."
    },
    {
      id: "st-conclave",
      title: "Conclave",
      platform: "Prime Video",
      platformColor: "#00a8e1",
      type: "Films",
      genre: "Thriller",
      year: 2024,
      seasons: "2h 00m",
      rating: 5,
      age: "12",
      thisWeek: false,
      imdbScore: "7.4",
      imdbId: "tt20215234",
      rtScore: "93%",
      rtSlug: "m/conclave",
      interests: ["Blockbuster Films", "Prestige Drama", "Crime & Thrillers"],
      cast: "Ralph Fiennes, Stanley Tucci, Isabella Rossellini",
      desc: "Cardinal Lawrence oversees the secretive, high-stakes election of a new Pope behind locked Vatican doors."
    },
    {
      id: "st-dune2",
      title: "Dune: Part Two",
      platform: "Sky / NOW",
      platformColor: "#0f766e",
      type: "Films",
      genre: "Sci-Fi",
      year: 2024,
      seasons: "2h 46m",
      rating: 5,
      age: "12",
      thisWeek: false,
      imdbScore: "8.5",
      imdbId: "tt15239678",
      rtScore: "92%",
      rtSlug: "m/dune_part_two",
      interests: ["Blockbuster Films", "Sci-Fi & Fantasy"],
      cast: "Timothée Chalamet, Zendaya, Javier Bardem",
      desc: "Denis Villeneuve's monumental sci-fi sequel sees Paul Atreides embrace his destiny on Arrakis."
    },
    {
      id: "st-dark",
      title: "Dark",
      platform: "Netflix",
      platformColor: "#e50914",
      type: "TV Series",
      genre: "Sci-Fi",
      year: 2020,
      seasons: "3 Seasons",
      rating: 5,
      age: "15",
      interests: ["World Cinema & International TV", "Sci-Fi & Fantasy", "Cult Classics & Indie"],
      cast: "Louis Hofmann, Lisa Vicari",
      desc: "A missing child sets four families in a German town on a frantic hunt for answers across generations and timelines."
    },
    {
      id: "st-parasite",
      title: "Parasite",
      platform: "Channel 4",
      platformColor: "#1d4ed8",
      type: "Films",
      genre: "Thriller",
      year: 2019,
      seasons: "2h 12m",
      rating: 5,
      age: "15",
      interests: ["World Cinema & International TV", "Crime & Thrillers", "Cult Classics & Indie"],
      cast: "Song Kang-ho, Choi Woo-shik",
      desc: "Bong Joon-ho's Oscar-winning Korean masterpiece about class, greed and deception in Seoul."
    },
    {
      id: "st-borgen",
      title: "Borgen",
      platform: "Netflix",
      platformColor: "#e50914",
      type: "TV Series",
      genre: "Drama",
      year: 2022,
      seasons: "4 Seasons",
      rating: 5,
      age: "15",
      interests: ["World Cinema & International TV", "Prestige Drama"],
      cast: "Sidse Babett Knudsen, Birgitte Hjort Sørensen",
      desc: "Acclaimed Danish political drama following Birgitte Nyborg's rise to Prime Minister."
    },
    {
      id: "st-in-the-mood",
      title: "In the Mood for Love",
      platform: "MUBI",
      platformColor: "#1e293b",
      type: "Films",
      genre: "Drama",
      year: 2000,
      seasons: "1h 38m",
      rating: 5,
      age: "PG",
      interests: ["World Cinema & International TV", "Cult Classics & Indie", "Arts, History & Culture"],
      cast: "Tony Leung, Maggie Cheung",
      desc: "Wong Kar-wai's intoxicating 1962 Hong Kong romance about two neighbours who suspect their spouses of infidelity."
    },
    {
      id: "st-twin-peaks",
      title: "Twin Peaks",
      platform: "Paramount+",
      platformColor: "#0064ff",
      type: "TV Series",
      genre: "Drama",
      year: 1990,
      seasons: "3 Seasons",
      rating: 5,
      age: "15",
      interests: ["Cult Classics & Indie", "Crime & Thrillers"],
      cast: "Kyle MacLachlan, Sheryl Lee",
      desc: "FBI Agent Dale Cooper investigates the murder of Laura Palmer in a surreal Pacific Northwest logging town."
    },
    {
      id: "st-withnail",
      title: "Withnail & I",
      platform: "BFI Player",
      platformColor: "#be123c",
      type: "Films",
      genre: "Comedy",
      year: 1987,
      seasons: "1h 47m",
      rating: 5,
      age: "15",
      interests: ["Cult Classics & Indie", "Comedy & Sitcoms"],
      cast: "Richard E. Grant, Paul McGann",
      desc: "Two unemployed actors escape their grim Camden flat for a disastrously wet weekend in the Lake District."
    },
    {
      id: "st-fallout",
      title: "Fallout",
      platform: "Prime Video",
      platformColor: "#00a8e1",
      type: "TV Series",
      genre: "Sci-Fi",
      year: 2024,
      seasons: "1 Season (8 eps)",
      rating: 5,
      age: "18",
      interests: ["Sci-Fi & Fantasy", "Comedy & Sitcoms"],
      cast: "Ella Purnell, Walton Goggins",
      desc: "Two hundred years after the apocalypse, a sheltered Vault dweller ventures into the darkly funny wasteland of Los Angeles."
    },
    {
      id: "st-mr-bates",
      title: "Mr Bates vs The Post Office",
      platform: "ITVX",
      platformColor: "#2563eb",
      type: "TV Series",
      genre: "Drama",
      year: 2024,
      seasons: "4 Episodes",
      rating: 5,
      age: "12",
      interests: ["Prestige Drama", "True Crime & Documentaries"],
      cast: "Toby Jones, Monica Dolan",
      desc: "The landmark drama telling the true story of the subpostmasters who fought for justice."
    },
    {
      id: "st-poor-things",
      title: "Poor Things",
      platform: "Disney+",
      platformColor: "#0063e5",
      type: "Films",
      genre: "Comedy",
      year: 2023,
      seasons: "2h 21m",
      rating: 5,
      age: "18",
      interests: ["Cult Classics & Indie", "Blockbuster Films"],
      cast: "Emma Stone, Mark Ruffalo, Willem Dafoe",
      desc: "Yorgos Lanthimos's fantastical, Oscar-winning odyssey following Bella Baxter's liberation across continents."
    },
    {
      id: "st-day-of-jackal",
      title: "The Day of the Jackal",
      platform: "Sky / NOW",
      platformColor: "#0f766e",
      type: "TV Series",
      genre: "Thriller",
      year: 2024,
      seasons: "1 Season (10 eps)",
      rating: 5,
      age: "15",
      thisWeek: false,
      interests: ["Crime & Thrillers", "Prestige Drama"],
      cast: "Eddie Redmayne, Lashana Lynch",
      desc: "Modern cat-and-mouse thriller pitting a chameleon-like hitman against a dogged MI6 officer."
    },
    {
      id: "st-asia",
      title: "Asia",
      platform: "BBC iPlayer",
      platformColor: "#ff4c98",
      type: "Documentaries",
      genre: "Documentary",
      year: 2024,
      seasons: "7 Episodes",
      rating: 5,
      age: "G",
      thisWeek: false,
      interests: ["True Crime & Documentaries", "Arts, History & Culture"],
      cast: "Sir David Attenborough",
      desc: "Four years in the making, exploring the wildest corners of Earth's largest continent."
    },
    {
      id: "st-big-boys",
      title: "Big Boys",
      platform: "Channel 4",
      platformColor: "#1d4ed8",
      type: "TV Series",
      genre: "Comedy",
      year: 2024,
      seasons: "2 Seasons",
      rating: 5,
      age: "15",
      interests: ["Comedy & Sitcoms"],
      cast: "Dylan Llewellyn, Jon Pointing",
      desc: "Tender, hilarious university comedy about an unlikely friendship between shy Jack and laddish Danny."
    },
    {
      id: "st-black-doves",
      title: "Black Doves",
      platform: "Netflix",
      platformColor: "#e50914",
      type: "TV Series",
      genre: "Thriller",
      year: 2024,
      seasons: "1 Season (6 eps)",
      rating: 4,
      age: "15",
      interests: ["Crime & Thrillers"],
      cast: "Keira Knightley, Ben Whishaw, Sarah Lancashire",
      desc: "A politician's wife leading a double life as a spy teams up with an old assassin friend in festive London."
    },
    {
      id: "st-premier-highlights",
      title: "Premier League: Classic Matches",
      platform: "Sky / NOW",
      platformColor: "#0f766e",
      type: "Sport",
      genre: "Sport",
      year: 2024,
      seasons: "On Demand",
      rating: 4,
      age: "G",
      interests: ["Live Sport"],
      cast: "Sky Sports Archive",
      desc: "Relive iconic title-deciders, stoppage-time winners and derby classics."
    },
    {
      id: "st-rivals",
      title: "Rivals",
      platform: "Disney+",
      platformColor: "#0063e5",
      type: "TV Series",
      genre: "Drama",
      year: 2024,
      seasons: "1 Season (8 eps)",
      rating: 5,
      age: "18",
      thisWeek: false,
      interests: ["Prestige Drama", "Comedy & Sitcoms"],
      cast: "David Tennant, Aidan Turner, Alex Hassell",
      desc: "Wickedly entertaining 1980s Cotswolds adaptation of Jilly Cooper's tale of TV barons and upper-crust scandal."
    },
    {
      id: "st-the-bear",
      title: "The Bear",
      platform: "Disney+",
      platformColor: "#0063e5",
      type: "TV Series",
      genre: "Drama",
      year: 2024,
      seasons: "3 Seasons",
      rating: 5,
      age: "15",
      thisWeek: false,
      interests: ["Prestige Drama", "Comedy & Sitcoms"],
      cast: "Jeremy Allen White, Ayo Edebiri, Ebon Moss-Bachrach",
      desc: "A young fine-dining chef returns to Chicago to run his family's chaotic sandwich shop."
    },
    {
      id: "st-say-nothing",
      title: "Say Nothing",
      platform: "Disney+",
      platformColor: "#0063e5",
      type: "TV Series",
      genre: "Drama",
      year: 2024,
      seasons: "Limited Series (9 eps)",
      rating: 5,
      age: "18",
      thisWeek: false,
      interests: ["Prestige Drama", "True Crime & Documentaries"],
      cast: "Lola Petticrew, Hazel Doupe, Anthony Boyle",
      desc: "Gripping adaptation of Patrick Radden Keefe's acclaimed history of The Troubles in Northern Ireland."
    },
    {
      id: "st-alien-romulus",
      title: "Alien: Romulus",
      platform: "Disney+",
      platformColor: "#0063e5",
      type: "Films",
      genre: "Sci-Fi",
      year: 2024,
      seasons: "1h 59m",
      rating: 4,
      age: "15",
      thisWeek: false,
      interests: ["Sci-Fi & Fantasy", "Blockbuster Films"],
      cast: "Cailee Spaeny, David Jonsson",
      desc: "Young space colonisers scavenging a derelict station come face-to-face with the universe's most terrifying life form."
    }
  ];

  // Build 7-day schedule for any channel (06:00 to 00:00)
  function buildDaySchedule(channelId, dayOffset) {
    const chObj = CHANNELS.find((c) => c.id === channelId);
    const baseTemplates =
      CHANNEL_TEMPLATES[channelId] ||
      CATEGORY_FALLBACK_TEMPLATES[chObj ? chObj.category : "Entertainment"] ||
      CATEGORY_FALLBACK_TEMPLATES.Entertainment;

    const shift = dayOffset % baseTemplates.length;
    const rotated = [...baseTemplates.slice(shift), ...baseTemplates.slice(0, shift)];

    const dayDate = new Date();
    dayDate.setHours(6, 0, 0, 0);
    dayDate.setDate(dayDate.getDate() + dayOffset);

    let cursorMinutes = 6 * 60;
    const endOfDayMinutes = 24 * 60;
    const programmes = [];
    let idx = 0;

    while (cursorMinutes < endOfDayMinutes) {
      const tpl = rotated[idx % rotated.length];
      const dur = Math.min(tpl.dur, endOfDayMinutes - cursorMinutes);
      if (dur <= 0) break;

      const start = new Date(dayDate.getTime() + (cursorMinutes - 6 * 60) * 60000);
      const end = new Date(start.getTime() + dur * 60000);

      programmes.push({
        id: `${channelId}-d${dayOffset}-${idx}`,
        channelId,
        dayOffset,
        title: tpl.title,
        genre: tpl.genre,
        rating: tpl.rating,
        ep: tpl.ep,
        desc: tpl.desc,
        cast: tpl.cast,
        stars: tpl.stars || null,
        isNew: Boolean(tpl.new),
        interests: tpl.interests || [],
        startMin: cursorMinutes,
        endMin: cursorMinutes + dur,
        startDate: start,
        endDate: end
      });

      cursorMinutes += dur;
      idx++;
    }
    return programmes;
  }

  return {
    PLATFORMS,
    CHANNEL_CATEGORIES,
    INTEREST_CATEGORIES,
    CHANNELS,
    STREAMING_CATALOGUE,
    buildDaySchedule
  };
})();
