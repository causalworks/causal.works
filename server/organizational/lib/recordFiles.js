'use strict';

// Adds file_count and first_file_id to list rows whose records have files attached (org_documents.source_ref_type / source_ref_id).

async function addFileInfo(pool, orgId, rows, sourceRefType, opts) {
  const o = opts || {};
  const idOf = o.idOf || ((r) => r.id);
  const ids = rows.map(idOf).filter((x) => Number.isInteger(Number(x)) && Number(x) > 0).map(Number);
  rows.forEach((r) => { r.file_count = 0; r.first_file_id = null; });
  if (!ids.length) return rows;
  const r = await pool.query(
    `SELECT source_ref_id, COUNT(*)::int AS n, (array_agg(id ORDER BY created_at))[1] AS first_id
       FROM org_documents
      WHERE org_id = $1 AND source_ref_type = $2 AND source_ref_id = ANY($3::bigint[]) AND archived_at IS NULL
      GROUP BY source_ref_id`, [orgId, sourceRefType, ids]);
  const by = new Map(r.rows.map((x) => [Number(x.source_ref_id), x]));
  rows.forEach((row) => {
    const hit = by.get(Number(idOf(row)));
    if (hit) { row.file_count = hit.n; row.first_file_id = hit.first_id; }
  });
  return rows;
}

module.exports = { addFileInfo };
