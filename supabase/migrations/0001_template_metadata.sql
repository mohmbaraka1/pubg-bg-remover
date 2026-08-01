-- يضيف حقول تصنيف/عدّادات/شعبية لجدول design_templates - أساس محرك مطابقة
-- التيمبلتات المستقبلي (اختيار أفضل تيمبلت حسب عدد الشخصيات/الأسلحة...
-- المختارة، وترتيبها حسب شعبية الاستخدام الفعلي).
-- شغّلها من Supabase Dashboard -> SQL Editor.

alter table design_templates
  add column if not exists category text,
  add column if not exists style_tags text[] not null default '{}',
  add column if not exists char_count int not null default 0,
  add column if not exists weapon_count int not null default 0,
  add column if not exists vehicle_count int not null default 0,
  add column if not exists helmet_count int not null default 0,
  add column if not exists backpack_count int not null default 0,
  add column if not exists frame_count int not null default 0,
  add column if not exists usage_count int not null default 0,
  add column if not exists last_used_at timestamptz;

-- فهرس يسرّع أهم استعلام لمحرك المطابقة لاحقاً: "لاقيلي تيمبلتات فيها X
-- شخصية وY سلاح، رتّبها حسب الأكثر استخداماً"
create index if not exists design_templates_matching_idx
  on design_templates (char_count, weapon_count, vehicle_count, usage_count desc);

-- زيادة ذرية (atomic) لعدّاد الاستخدام - أأمن من read-then-write من الفرونت
-- إند (لو صمّمين اتنين صدّروا بنفس اللحظة، ما تضيع أي زيادة).
create or replace function increment_template_usage(tpl_id uuid)
returns void
language sql
as $$
  update design_templates
  set usage_count = usage_count + 1, last_used_at = now()
  where id = tpl_id;
$$;
