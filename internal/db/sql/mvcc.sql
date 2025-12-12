-- name: txid-current
SELECT txid_current()

-- name: txid-current-snapshot
SELECT txid_current_snapshot()::text

-- name: extension-exists
SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = $1)
