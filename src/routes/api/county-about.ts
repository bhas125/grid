import { createFileRoute } from "@tanstack/react-router";
import type { AboutSection, CountyAbout } from "@/data/types";

const UA = "GridTN/1.0 (tennessee situation monitor; grid.blakehassler.com)";
const TTL = 12 * 60 * 60_000;
const FETCH_MS = 5500;

const VOYAGE: Record<string, string> = {
  Davidson: "Nashville",
  Shelby: "Memphis",
  Knox: "Knoxville",
  Hamilton: "Chattanooga",
  Rutherford: "Murfreesboro",
  Williamson: "Franklin (Tennessee)",
  Montgomery: "Clarksville",
  Sumner: "Gallatin (Tennessee)",
  Wilson: "Lebanon (Tennessee)",
  Sevier: "Gatlinburg",
  Blount: "Great Smoky Mountains National Park",
  Washington: "Johnson City",
  Sullivan: "Bristol (Tennessee)",
  Madison: "Jackson (Tennessee)",
  Bradley: "Cleveland (Tennessee)",
  Putnam: "Cookeville",
  Maury: "Columbia (Tennessee)",
  Anderson: "Oak Ridge",
  Hamblen: "Morristown (Tennessee)",
  Coffee: "Manchester (Tennessee)",
  Greene: "Greeneville",
  Carter: "Elizabethton",
  Cumberland: "Crossville",
  Roane: "Kingston (Tennessee)",
  Loudon: "Loudon (Tennessee)",
  Jefferson: "Jefferson City (Tennessee)",
  Cocke: "Newport (Tennessee)",
  Monroe: "Sweetwater (Tennessee)",
  McMinn: "Athens (Tennessee)",
  Warren: "McMinnville (Tennessee)",
  Bedford: "Shelbyville (Tennessee)",
  Lincoln: "Fayetteville (Tennessee)",
  Franklin: "Winchester (Tennessee)",
  Marion: "South Pittsburg",
  Rhea: "Dayton (Tennessee)",
  Campbell: "Jellico",
  Claiborne: "Cumberland Gap",
  Weakley: "Martin (Tennessee)",
  Obion: "Union City (Tennessee)",
  Dyer: "Dyersburg",
  Gibson: "Humboldt (Tennessee)",
  Haywood: "Brownsville (Tennessee)",
  Tipton: "Covington (Tennessee)",
  Fayette: "Somerville (Tennessee)",
  Hardeman: "Bolivar (Tennessee)",
  Hardin: "Savannah (Tennessee)",
  Lawrence: "Lawrenceburg (Tennessee)",
  Giles: "Pulaski (Tennessee)",
  Robertson: "Springfield (Tennessee)",
  Cheatham: "Ashland City",
  Dickson: "Dickson (Tennessee)",
  Hickman: "Centerville (Tennessee)",
  Humphreys: "Waverly (Tennessee)",
  Stewart: "Dover (Tennessee)",
  Houston: "Erin (Tennessee)",
  Henry: "Paris (Tennessee)",
  Carroll: "Huntingdon (Tennessee)",
  Benton: "Camden (Tennessee)",
  Decatur: "Decaturville",
  Henderson: "Lexington (Tennessee)",
  Chester: "Henderson (Tennessee)",
  McNairy: "Selmer",
  Wayne: "Waynesboro (Tennessee)",
  Perry: "Linden (Tennessee)",
  Lewis: "Hohenwald",
  Marshall: "Lewisburg (Tennessee)",
  Moore: "Lynchburg (Tennessee)",
  Cannon: "Woodbury (Tennessee)",
  DeKalb: "Smithville (Tennessee)",
  White: "Sparta (Tennessee)",
  "Van Buren": "Spencer (Tennessee)",
  Bledsoe: "Pikeville (Tennessee)",
  Sequatchie: "Dunlap (Tennessee)",
  Grundy: "Monteagle",
  Polk: "Ducktown",
  Meigs: "Decatur (Tennessee)",
  Union: "Maynardville",
  Grainger: "Rutledge (Tennessee)",
  Hawkins: "Rogersville (Tennessee)",
  Hancock: "Sneedville",
  Johnson: "Mountain City",
  Unicoi: "Erwin (Tennessee)",
  Scott: "Oneida (Tennessee)",
  Fentress: "Jamestown (Tennessee)",
  Pickett: "Byrdstown",
  Overton: "Livingston (Tennessee)",
  Clay: "Celina (Tennessee)",
  Jackson: "Gainesboro",
  Macon: "Lafayette (Tennessee)",
  Smith: "Carthage (Tennessee)",
  Trousdale: "Hartsville (Tennessee)",
  Lake: "Tiptonville",
  Crockett: "Alamo (Tennessee)",
  Lauderdale: "Ripley (Tennessee)",
};

const CHAIN =
  /\b(hooters|kroger|publix|aldi|whole foods|trader joe|melting pot|spaghetti factory|mcdonald|wendy'?s|walmart|target|starbucks|subway|applebee|chili'?s|buffalo wild|ihop|denny'?s|taco bell|burger king|chick-fil-a|kfc|pizza hut|domino|holiday inn|marriott|hilton|hampton inn|super 8|days inn)\b/i;

const SKIP_SEC =
  /demographics?|census|politics|election|government|education|media|infrastructure|transportation|references|external links|see also|notes|bibliography|further reading|adjacent counties|racial|climate|flora|religion|crime|sister cities|consulates|get in|get around|sleep|connect|cope|stay safe|buy|learn|go next/i;

type Cache = { at: number; body: CountyAbout };
const cache = new Map<string, Cache>();

function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function splitSections(text: string, min = 2, max = 2) {
  const out: Record<string, string> = {};
  if (!text) return out;
  const re = new RegExp(`\\n(={${min},${max}}) ([^=\\n]+) \\1\\n`, "g");
  let last = 0;
  let key = "_lede";
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out[key] = text.slice(last, m.index).trim();
    key = m[2].trim().toLowerCase();
    last = re.lastIndex;
  }
  out[key] = text.slice(last).trim();
  return out;
}

function grab(map: Record<string, string>, re: RegExp) {
  for (const [k, v] of Object.entries(map)) {
    if (re.test(k) && v && !SKIP_SEC.test(k)) return v;
  }
  return "";
}

function tidy(s: string) {
  return decode(s)
    .replace(/\([^)]*IPA[^)]*\)/gi, "")
    .replace(/\s\([^)]{0,10}[əɪæɑɔʊʌˈˌθðŋ][^)]{0,28}\)/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text: string, n: number, skip?: (s: string) => boolean) {
  const clean = tidy(text);
  const parts = clean
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 28 && !skip?.(s));
  return parts.slice(0, n).join(" ");
}

function boring(s: string) {
  return /as of the \d{4} census|population was [\d,]+|micropolitan statistical|combined statistical|according to the u\.s\. census|total area of \d|is a county in the u\.s\. state of tennessee|county seat is/i.test(
    s,
  );
}

function lines(text: string, max: number) {
  return text
    .split(/\n+/)
    .map((l) => tidy(l.replace(/^\*+\s*/, "")))
    .filter((l) => l.length > 8 && l.length < 160 && /[A-Za-z]/.test(l[0] ?? ""))
    .slice(0, max);
}

function looksLikeList(text: string) {
  const ls = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 2);
  const periods = (text.match(/\./g) || []).length;
  return ls.length >= 3 && periods < Math.max(2, ls.length / 2);
}

function compactList(text: string, n: number) {
  return lines(text, n).join(" · ");
}

function places(text: string, max: number) {
  const items: string[] = [];
  const re = /^\s*\d+\s+([A-Z][^.\n]{2,70})\.\s*([^\n]{0,260})/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && items.length < max) {
    const name = tidy(m[1].replace(/\s*\([^)]*\)\s*$/, "").replace(/, ☏.*$/, "").replace(/,\s*$/, ""));
    if (!name || CHAIN.test(name)) continue;
    const rest = tidy(m[2])
      .replace(/☏[^,.\n]*/g, "")
      .replace(/\bfax\s*\+?1?[\d\s().-]*/gi, "")
      .replace(/\b\+1[\d\s().-]{7,}/g, "")
      .replace(/\b(?:updated \w+ \d{4})\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[,\s.;]+/, "");
    const bit = (rest.split(/(?<=\.)\s/)[0] ?? "").trim();
    if (CHAIN.test(bit) || /grocery|kroger|publix/i.test(bit)) continue;
    if (/^\d/.test(bit) && bit.length < 40) continue;
    const line = bit && bit.length > 22 && !/closed /i.test(bit) ? `${name} — ${bit}` : name;
    if (line.length > 12) items.push(line.slice(0, 200));
  }
  return items;
}

function section(id: string, title: string, body?: string, items?: string[]): AboutSection | null {
  const cleanItems = (items ?? []).map((x) => x.trim()).filter(Boolean);
  const cleanBody = body?.trim();
  if (!cleanBody && !cleanItems.length) return null;
  return { id, title, body: cleanBody || undefined, items: cleanItems.length ? cleanItems : undefined };
}

async function extract(host: string, title: string): Promise<{ text: string; href: string }> {
  const q = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    inprop: "url",
    explaintext: "1",
    exsectionformat: "wiki",
    redirects: "1",
    format: "json",
    titles: title,
  });
  const url = `${host}/w/api.php?${q.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return { text: "", href: "" };
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { extract?: string; missing?: boolean; fullurl?: string; title?: string }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing || !page.extract) return { text: "", href: "" };
  if (/may refer to:/i.test(page.extract.slice(0, 400))) return { text: "", href: "" };
  return { text: page.extract, href: page.fullurl ?? "" };
}

function build(county: string, seat: string, wikiC: string, wikiS: string, voyage: string, href: string): CountyAbout {
  const c = splitSections(wikiC, 2, 4);
  const s = splitSections(wikiS, 2, 4);
  const v = splitSections(voyage, 2, 2);

  const touristRaw = grab(s, /^tourism$/) || grab(c, /tourist|attraction|tourism/);
  const nick = sentences(grab(s, /^nicknames?$/), 2);
  const tourism = looksLikeList(touristRaw) ? compactList(touristRaw, 5) : sentences(touristRaw, 3, boring);
  const arts = sentences(grab(s, /arts and culture|entertainment/), 2, boring);
  const countyLede = sentences(c._lede ?? "", 3, boring);
  const seatLede = sentences(s._lede ?? "", 2, boring);
  const lede = tourism || nick || seatLede || countyLede || sentences(c._lede ?? "", 2);
  const known = [tourism, nick].filter(Boolean).join(" ") || arts || lede;

  const economy = sentences(grab(s, /^economy$/) || grab(s, /top employers/) || grab(c, /^economy$/), 3, boring);
  const history = sentences(grab(c, /^history$/) || grab(s, /^history$/), 2, boring);
  const parks = sentences(grab(s, /parks and recreation/) || grab(c, /^parks$/) || grab(c, /protected area/), 2, boring);
  const culture = sentences(grab(c, /popular culture/), 1, boring);
  const geo = sentences(grab(c, /^geography$/), 2, (x) => boring(x) || /total area of|square miles/i.test(x));

  const seeV = places(v.see ?? "", 6);
  const doV = places(v.do ?? "", 5);
  const eatV = places(v.eat ?? "", 6);
  const people = lines(grab(c, /notable people|notable residents/) || grab(s, /notable people/), 10).filter(
    (x) => !/^see list of/i.test(x),
  );
  const towns = lines(grab(c, /^communities$/) || grab(c, /^cities$/), 8).filter((x) => !/census-designated|unincorporated/i.test(x));

  const see = [...seeV];
  const doit = [...doV];
  if (parks) doit.push(parks);
  if (culture && doit.length < 5) doit.push(culture);
  if (geo && doit.length < 5) doit.push(geo);

  const eat = eatV.length ? eatV : [];
  const eatBody = eat.length ? undefined : sentences(grab(s, /^dining$/), 2);

  const sections = [
    section("known", "Known for", known),
    section("industry", "Industry", economy),
    section("see", "See", see.length ? undefined : tourism || history, see.slice(0, 6)),
    section("do", "Do", doit.length ? undefined : parks, doit.slice(0, 5)),
    section("eat", "Eat", eatBody, eat.slice(0, 5)),
    section("people", "People", undefined, people),
    section("towns", "Towns", undefined, towns.slice(0, 6)),
  ].filter((x): x is AboutSection => !!x);

  return {
    county,
    href: href || `https://en.wikipedia.org/wiki/${encodeURIComponent(`${county} County, Tennessee`)}`,
    lede: lede || `${county} County, Tennessee. Seat: ${seat}.`,
    sections,
  };
}

export const Route = createFileRoute("/api/county-about")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const name = (url.searchParams.get("name") ?? "").trim();
        const seat = (url.searchParams.get("seat") ?? "").trim();
        if (!name) {
          return Response.json({ error: "name required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
        }
        const hit = cache.get(name);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json(hit.body, { headers: { "Cache-Control": "public, max-age=3600" } });
        }
        try {
          const voyageTitle = VOYAGE[name];
          const jobs: Promise<{ text: string; href: string }>[] = [
            extract("https://en.wikipedia.org", `${name} County, Tennessee`),
            seat ? extract("https://en.wikipedia.org", `${seat}, Tennessee`) : Promise.resolve({ text: "", href: "" }),
            voyageTitle
              ? extract("https://en.wikivoyage.org", voyageTitle)
              : Promise.resolve({ text: "", href: "" }),
          ];
          const [countyPage, seatPage, voyagePage] = await Promise.all(jobs);
          const body = build(
            name,
            seat,
            countyPage.text,
            seatPage.text,
            voyagePage.text,
            countyPage.href || seatPage.href,
          );
          cache.set(name, { at: Date.now(), body });
          return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
        } catch {
          return Response.json(
            {
              county: name,
              href: `https://en.wikipedia.org/wiki/${encodeURIComponent(`${name} County, Tennessee`)}`,
              lede: "",
              sections: [],
            } satisfies CountyAbout,
            { status: 200, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
