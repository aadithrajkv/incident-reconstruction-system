alter table public.grid_issues
  drop constraint grid_issues_image_path_check;
alter table public.grid_issues
  add constraint grid_issues_image_path_check check (
    image_path is null or image_path ~ '^[0-9a-f-]+/-?[0-9]+,-?[0-9]+/[0-9a-f-]+[.](webp|jpg|png)$'
  );
