create table if not exists crime_live (
  id text primary key,
  date text,
  city text not null default '',
  county text not null default '',
  address text not null default '',
  zip text,
  lat double precision not null,
  lon double precision not null,
  type text not null,
  offense text not null default '',
  source text not null default '',
  killed integer not null default 0,
  injured integer not null default 0,
  added_at timestamptz not null default now()
);
create index if not exists crime_live_date_idx on crime_live (date);
create table if not exists crime_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
