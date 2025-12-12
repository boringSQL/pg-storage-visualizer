-- name: list-indexes
SELECT
    c.relname as index_name,
    t.relname as table_name,
    am.amname as index_type,
    pg_relation_size(c.oid) as size,
    c.relpages as num_pages,
    ix.indisunique as is_unique,
    ix.indisprimary as is_primary
FROM pg_class c
JOIN pg_index ix ON c.oid = ix.indexrelid
JOIN pg_class t ON ix.indrelid = t.oid
JOIN pg_am am ON c.relam = am.oid
WHERE am.amname = 'btree'
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY c.relname

-- name: bt-metap
SELECT magic, version, root, level, fastroot, fastlevel FROM bt_metap($1)

-- name: bt-page-stats
SELECT blkno, type::text, live_items, dead_items, avg_item_size,
       page_size, free_size, btpo_prev, btpo_next, btpo_level, btpo_flags
FROM bt_page_stats($1, $2)

-- name: bt-page-items
SELECT itemoffset, ctid::text, itemlen, nulls, vars, data,
       COALESCE(dead, false), htid::text, tids::text
FROM bt_page_items($1, $2)

-- name: pgstatindex
SELECT version, tree_level, index_size, root_block_no, internal_pages,
       leaf_pages, empty_pages, deleted_pages,
       avg_leaf_density, leaf_fragmentation
FROM pgstatindex($1)

-- name: index-page-count
SELECT relpages FROM pg_class WHERE relname = $1

-- name: all-page-stats
SELECT s.blkno, s.type::text, s.live_items, s.dead_items, s.avg_item_size,
       s.page_size, s.free_size, s.btpo_prev, s.btpo_next, s.btpo_level, s.btpo_flags
FROM generate_series(1, $2 - 1) AS g(n)
CROSS JOIN LATERAL bt_page_stats($1, g.n) AS s
