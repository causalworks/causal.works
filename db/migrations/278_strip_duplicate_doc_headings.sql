-- 278: the workshop Overview and Library render each document's title above its body, and the
-- bodies started with the same "# Title" line, so every title showed twice. Strip that leading
-- heading line. The Library items 3-8 follow the same rule.

UPDATE workshop_documents
   SET content = regexp_replace(content, '^# [^\n]*\n+', '')
 WHERE split_part(content, E'\n', 1) = '# ' || title;

UPDATE cooperative_work_library_items
   SET body_markdown = regexp_replace(body_markdown, '^# [^\n]*\n+', '')
 WHERE id IN (3, 4, 5);

UPDATE cooperative_work_library_items w SET body_markdown = d.content
  FROM workshop_documents d
 WHERE d.workspace_id = 42 AND w.workshop_id = (SELECT project_id FROM workshop_workspaces WHERE id = 42)
   AND w.title = d.title;
