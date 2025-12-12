-- name: list-tables
SELECT
    c.relname as table_name,
    n.nspname as schema_name,
    pg_relation_size(c.oid) as size,
    c.relpages as total_pages,
    c.reltuples::bigint as row_count,
    COALESCE(s.n_dead_tup, 0) as dead_rows,
    (SELECT COUNT(*) FROM pg_index WHERE indrelid = c.oid)::int as index_count
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
ORDER BY c.relname

-- name: pgstattuple
SELECT table_len, tuple_count, tuple_len, tuple_percent,
       dead_tuple_count, dead_tuple_len, dead_tuple_percent,
       free_space, free_percent
FROM pgstattuple($1)

-- name: table-columns
SELECT
    a.attname as name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
    a.attnum as position,
    a.attnotnull as not_null,
    COALESCE(EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.oid
          AND i.indisprimary
          AND a.attnum = ANY(i.indkey)
    ), false) as is_pk
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE c.relname = $1
  AND n.nspname = 'public'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum

-- name: table-indexes
SELECT
    c.relname as index_name,
    t.relname as table_name,
    am.amname as index_type,
    pg_relation_size(c.oid) as size,
    c.relpages as num_pages,
    ix.indisunique as is_unique,
    ix.indisprimary as is_primary,
    ARRAY(
        SELECT a.attname
        FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        ORDER BY k.ord
    ) as columns
FROM pg_class c
JOIN pg_index ix ON c.oid = ix.indexrelid
JOIN pg_class t ON ix.indrelid = t.oid
JOIN pg_am am ON c.relam = am.oid
WHERE t.relname = $1
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY c.relname

-- name: table-page-count
SELECT relpages FROM pg_class WHERE relname = $1

-- name: heap-page-items
SELECT
    lp,
    lp_off,
    lp_flags,
    lp_len,
    COALESCE(t_xmin::text::bigint, 0),
    COALESCE(t_xmax::text::bigint, 0),
    COALESCE(t_ctid::text, ''),
    COALESCE(t_infomask, 0),
    COALESCE(t_infomask2, 0)
FROM heap_page_items(get_raw_page($1, $2))

-- name: heap-page-item-attrs
SELECT
    lp,
    t_attrs
FROM heap_page_item_attrs(get_raw_page($1, $2), $1::regclass)
WHERE lp_flags = 1 AND t_attrs IS NOT NULL

-- name: heap-page-stats
SELECT
    COALESCE(COUNT(*) FILTER (WHERE lp_flags = 1 AND COALESCE(t_xmax::text::bigint, 0) = 0), 0) as live_tuples,
    COALESCE(COUNT(*) FILTER (WHERE lp_flags = 1 AND COALESCE(t_xmax::text::bigint, 0) != 0), 0) as dead_tuples,
    COALESCE(SUM(CASE WHEN lp_flags = 1 THEN lp_len ELSE 0 END), 0) as used_space,
    COUNT(*) as lp_count
FROM heap_page_items(get_raw_page($1, $2))

-- name: primary-key-column
SELECT a.attname
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE i.indisprimary
  AND c.relname = $1
  AND n.nspname = 'public'
LIMIT 1

-- name: indexed-columns
SELECT DISTINCT a.attname, i.relname as index_name
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
WHERE t.relname = $1
  AND n.nspname = 'public'
  AND a.attnum > 0
ORDER BY a.attname

-- name: find-row-pk-column
SELECT a.attname
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
JOIN pg_class c ON c.oid = i.indrelid
WHERE c.relname = $1 AND i.indisprimary
LIMIT 1
