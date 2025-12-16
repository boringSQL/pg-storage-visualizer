-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pageinspect;
CREATE EXTENSION IF NOT EXISTS pgstattuple;

-- Demo table for bloat demonstration
CREATE TABLE demo (
    id integer PRIMARY KEY,
    name text,
    status text
);

INSERT INTO demo
SELECT i, 'item_' || i, 'active'
FROM generate_series(1, 50000) i;

-- HOT update demo table
CREATE TABLE hot_demo (
    id integer PRIMARY KEY,
    indexed_col text,
    hot_col text
);

CREATE INDEX ON hot_demo(indexed_col);

INSERT INTO hot_demo
SELECT i, 'indexed_' || i, 'hot_' || i
FROM generate_series(1, 1000) i;

-- Analyze tables for accurate stats
ANALYZE demo;
ANALYZE hot_demo;
