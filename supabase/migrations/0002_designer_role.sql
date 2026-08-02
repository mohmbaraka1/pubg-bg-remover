-- صلاحيات محدودة للمصممين: يقدروا يرفعوا عناصر لمكتبة الألعاب فقط، وما
-- يقدروا يفتحوا Template Editor ولا Grid Extractor (تلك تبقى للأدمن بس -
-- محمية أصلاً بفحص الإيميل بالفرونت إند، هذا الملف بس لصلاحيات قاعدة البيانات).
--
-- بعد تشغيل هذا الملف، لإضافة مصمم: لاقي الـ id تبعه بجدول auth.users
-- (بالإيميل)، وشغّل:
--   insert into profiles (id, email, role) values ('<uuid>', '<email>', 'designer');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'designer' check (role in ('admin', 'designer')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "users read own profile" on profiles
  for select using (auth.uid() = id);

-- يقرأ دور المستخدم الحالي - يُستخدم بباقي الـ policies تحت
create or replace function current_user_role()
returns text
language sql stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- المصممين (والأدمن) يقدروا يضيفوا عناصر جديدة لمكتبة الألعاب
create policy "designers insert game_items" on game_items
  for insert
  with check (current_user_role() in ('admin', 'designer'));

-- المصممين (والأدمن) يقدروا يرفعوا ملفات تحت مسار game-library/ بالتخزين
create policy "designers upload game-library storage" on storage.objects
  for insert
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = 'game-library'
    and current_user_role() in ('admin', 'designer')
  );
