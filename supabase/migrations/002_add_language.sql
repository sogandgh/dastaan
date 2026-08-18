alter table public.collections add column language text not null default 'fa';
alter table public.cards add column language text not null default 'fa';
alter table public.stories add column language text not null default 'fa';

create index collections_owner_language_idx on public.collections (owner_id, language);
create index stories_owner_language_idx on public.stories (owner_id, language);
