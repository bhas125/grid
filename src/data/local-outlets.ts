/** Local outlets used to bias county news toward papers/TV that actually cover the place. */
export type Outlet = { name: string; site: string; rss?: string };

export const STATE_OUTLETS: Outlet[] = [
  { name: "Tennessee Lookout", site: "tennesseelookout.com" },
  { name: "WKRN", site: "wkrn.com", rss: "https://www.wkrn.com/feed/" },
  { name: "NewsChannel 5", site: "newschannel5.com" },
  { name: "The Tennessean", site: "tennessean.com" },
];

export const COUNTY_OUTLETS: Record<string, Outlet[]> = {
  Shelby: [
    { name: "Daily Memphian", site: "dailymemphian.com" },
    { name: "Commercial Appeal", site: "commercialappeal.com" },
    { name: "WMC Action News 5", site: "wmcactionnews5.com" },
    { name: "FOX13 Memphis", site: "fox13memphis.com" },
    { name: "Local 24", site: "localmemphis.com" },
  ],
  Davidson: [
    { name: "The Tennessean", site: "tennessean.com" },
    { name: "Nashville Banner", site: "nashvillebanner.com", rss: "https://www.nashvillebanner.com/feed" },
    { name: "NewsChannel 5", site: "newschannel5.com" },
    { name: "WSMV", site: "wsmv.com" },
    { name: "Nashville Scene", site: "nashvillescene.com" },
    { name: "WKRN", site: "wkrn.com", rss: "https://www.wkrn.com/feed/" },
  ],
  Knox: [
    { name: "Knoxville News Sentinel", site: "knoxnews.com" },
    { name: "WATE", site: "wate.com", rss: "https://www.wate.com/news/feed/" },
    { name: "WBIR", site: "wbir.com", rss: "https://www.wbir.com/feeds/syndication/rss/news" },
    { name: "WVLT", site: "wvlt.tv" },
  ],
  Hamilton: [
    { name: "Chattanooga Times Free Press", site: "timesfreepress.com" },
    { name: "WTVC", site: "newschannel9.com" },
    { name: "WRCB", site: "wrcbtv.com" },
  ],
  Rutherford: [
    { name: "Daily News Journal", site: "dnj.com" },
    { name: "Murfreesboro Post", site: "murfreesboropost.com" },
    { name: "The Tennessean", site: "tennessean.com" },
  ],
  Williamson: [
    { name: "The Tennessean", site: "tennessean.com" },
    { name: "Williamson Herald", site: "williamsonherald.com" },
    { name: "WSMV", site: "wsmv.com" },
  ],
  Montgomery: [
    { name: "The Leaf-Chronicle", site: "theleafchronicle.com" },
    { name: "Clarksville Now", site: "clarksvillenow.com", rss: "https://www.clarksvillenow.com/feed/" },
  ],
  Sullivan: [
    { name: "Times News", site: "timesnews.net" },
    { name: "WJHL", site: "wjhl.com", rss: "https://www.wjhl.com/feed/" },
    { name: "WCYB", site: "wcyb.com" },
  ],
  Washington: [
    { name: "Johnson City Press", site: "johnsoncitypress.com" },
    { name: "WJHL", site: "wjhl.com", rss: "https://www.wjhl.com/feed/" },
  ],
  Madison: [
    { name: "The Jackson Sun", site: "jacksonsun.com" },
    { name: "WBBJ", site: "wbbjtv.com" },
  ],
  Sumner: [
    { name: "The Tennessean", site: "tennessean.com" },
    { name: "Gallatin News", site: "gallatinnews.com" },
  ],
  Wilson: [{ name: "The Tennessean", site: "tennessean.com" }, { name: "Wilson Post", site: "wilsonpost.com" }],
  Blount: [
    { name: "The Daily Times", site: "thedailytimes.com", rss: "https://www.thedailytimes.com/search/?f=rss" },
    { name: "WATE", site: "wate.com", rss: "https://www.wate.com/news/feed/" },
  ],
  Bradley: [{ name: "Cleveland Daily Banner", site: "clevelandbanner.com" }, { name: "WTVC", site: "newschannel9.com" }],
  Putnam: [
    { name: "Herald-Citizen", site: "herald-citizen.com", rss: "https://herald-citizen.com/search/?f=rss" },
  ],
  Maury: [{ name: "Columbia Daily Herald", site: "columbiadailyherald.com" }],
  Anderson: [{ name: "Oak Ridger", site: "oakridger.com" }, { name: "WBIR", site: "wbir.com" }],
  Sevier: [{ name: "The Mountain Press", site: "themountainpress.com" }, { name: "WBIR", site: "wbir.com" }],
};

const MARKET_OUTLETS: Record<string, Outlet[]> = {
  Memphis: COUNTY_OUTLETS.Shelby,
  Nashville: COUNTY_OUTLETS.Davidson,
  Knoxville: COUNTY_OUTLETS.Knox,
  Chattanooga: COUNTY_OUTLETS.Hamilton,
  "Tri-Cities": COUNTY_OUTLETS.Sullivan,
  Jackson: COUNTY_OUTLETS.Madison,
};

export function outletsFor(county: string | undefined, market?: string): Outlet[] {
  if (!county) return STATE_OUTLETS;
  const local = COUNTY_OUTLETS[county];
  if (local?.length) return local;
  if (market && MARKET_OUTLETS[market]) return MARKET_OUTLETS[market];
  return STATE_OUTLETS;
}

export function dedicatedCounty(county: string | undefined): boolean {
  return Boolean(county && COUNTY_OUTLETS[county]);
}
