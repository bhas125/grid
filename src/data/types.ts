export type Division = "East" | "Middle" | "West";

export type CountyProfile =
  | "metro_d"
  | "collar"
  | "midsize_r"
  | "tri"
  | "rural_w"
  | "rural_e"
  | string;

export type Aug6 = {
  kind: string;
  offices: string[];
  note: string;
} | null;

export type County = {
  name: string;
  fips: string;
  seat: string;
  division: Division;
  market: string;
  pop: number;
  pop2020: number;
  growth: number;
  trump: number;
  harris: number;
  trumpPct: number;
  harrisPct: number;
  other: number;
  totalVotes: number;
  margin: number;
  medianIncome: number;
  temp: number;
  tempLabel: string;
  profile: CountyProfile;
  issues: string[];
  aug6: Aug6;
  brief: {
    lede: string;
    talking: string[];
    soWhat: string;
  };
};

export type GeoFeature = {
  type: "Feature";
  properties: { name: string; fips: string; area: number };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

export type Precinct = {
  id: string;
  name: string;
  fips: string;
  d: number;
  r: number;
  t: number;
  g: GeoFeature["geometry"];
};

export type RaceCandidate = { n: string; p: string; v: number };
export type Race = { o: string; d: string; c: RaceCandidate[] };

export type NewsItem = {
  id: string;
  kind: "news" | "official";
  headline: string;
  href: string;
  source: string;
  published: string;
  county?: string;
  ongoing?: boolean;
};

export type Alert = {
  id: string;
  event: string;
  severity: string;
  headline: string;
  area: string;
  ends?: string;
  href: string;
  counties: string[];
};

export type MarketQuote = {
  id: string;
  label: string;
  digits: number;
  suffix?: string;
  value: number;
  change: number;
};

export type WxNow = {
  temp: number;
  code: number;
  label: string;
  live: boolean;
};

export type LayerId =
  | "interstates"
  | "weather"
  | "sites"
  | "flock"
  | "p24"
  | "p26";

export type Layers = Record<LayerId, boolean>;

export type CrimeKind = "hom" | "sht";
export type CrimeLayers = Record<CrimeKind, boolean>;

export type TabId = "news" | "sit" | "vote" | "gov" | "crime";

export type Official = { office: string; name: string };

export type AlprPoint = {
  id: number;
  lat: number;
  lon: number;
  op: string;
  dir: string;
};

export type Site = {
  name: string;
  county: string;
  lon: number;
  lat: number;
  kind: string;
};

export type Road = {
  id: string;
  kind: "interstate" | "arterial";
  pts: [number, number][];
};

export type CrimeIncident = {
  id: string;
  date: string | null;
  city: string;
  county: string;
  address: string;
  zip?: string;
  lat: number;
  lon: number;
  type: string;
  offense: string;
  source: string;
  killed: number;
  injured: number;
};
