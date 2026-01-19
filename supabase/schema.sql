create table if not exists public.chats (
  chat_id bigint primary key,
  language text not null default 'en',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id bigint not null references public.chats(chat_id) on delete cascade,
  user_id bigint not null,
  first_name text,
  last_name text,
  username text,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.events (
  id bigserial primary key,
  chat_id bigint not null references public.chats(chat_id) on delete cascade,
  name text not null,
  event_date timestamptz not null,
  reminder_date timestamptz,
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_members_updated_at on public.chat_members;

create trigger chat_members_updated_at
before update on public.chat_members
for each row execute function public.set_updated_at();

drop trigger if exists events_updated_at on public.events;

create trigger events_updated_at
before update on public.events
for each row execute function public.set_updated_at();
