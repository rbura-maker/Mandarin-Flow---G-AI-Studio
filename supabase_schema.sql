-- Create a table for User Profiles
create table profiles (
  id uuid references auth.users not null primary key,
  hsk_level int default 1,
  xp int default 0,
  streak_days int default 0,
  last_study_date bigint default 0
);

-- Create a table for Vocabulary
create table vocabulary (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  hanzi text not null,
  pinyin text not null,
  meaning text not null,
  level int default 1,
  tags text[] default '{}'
);

-- Create a table for SRS State
-- Note: vocab_id references vocabulary.id
create table srs_state (
  id uuid default gen_random_uuid() primary key,
  vocab_id uuid references vocabulary(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  ease_factor float default 2.5,
  interval float default 0,
  due_date bigint default 0,
  reviews int default 0,
  lapses int default 0
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;
alter table vocabulary enable row level security;
alter table srs_state enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "Users can view own vocabulary" on vocabulary for select using (auth.uid() = user_id);
create policy "Users can insert own vocabulary" on vocabulary for insert with check (auth.uid() = user_id);
create policy "Users can update own vocabulary" on vocabulary for update using (auth.uid() = user_id);
create policy "Users can delete own vocabulary" on vocabulary for delete using (auth.uid() = user_id);

create policy "Users can view own srs state" on srs_state for select using (auth.uid() = user_id);
create policy "Users can insert own srs state" on srs_state for insert with check (auth.uid() = user_id);
create policy "Users can update own srs state" on srs_state for update using (auth.uid() = user_id);

-- Function to handle new user creation
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, hsk_level, xp, streak_days, last_study_date)
  values (new.id, 1, 0, 0, 0);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to automatically create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
