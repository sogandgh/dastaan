create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  language text not null default 'fa',
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  language text not null default 'fa',
  word_fa text not null,
  word_en text not null default '',
  image text not null,
  created_at timestamptz not null default now()
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  language text not null default 'fa',
  label text not null,
  minutes int not null,
  characters text,
  scenes jsonb not null,
  saved_at timestamptz not null default now(),
  unique (owner_id, cache_key)
);

create index cards_owner_collection_idx on public.cards (owner_id, collection_id);
create index collections_owner_language_idx on public.collections (owner_id, language);
create index stories_owner_language_idx on public.stories (owner_id, language);
create index stories_owner_cache_key_idx on public.stories (owner_id, cache_key);

alter table public.collections enable row level security;
alter table public.cards enable row level security;
alter table public.stories enable row level security;

create policy "own collections" on public.collections
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own cards" on public.cards
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own stories" on public.stories
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
