# pg-storage-visualizer

PostgreSQL storage visualization tool for education purposes. Explore tables and
indexes - page structure, tuples, MVCC, HOT chains, bloat and more.

**IMPORTANT** this tool is not to be used for running against any production
PostgreSQL cluster!

## Features

- **Table inspection** - heap pages, tuple layout, MVCC visibility
- **Index visualization** - B-tree structure, page density, bloat analysis
- **Try HOT update** - see heap-only tuples and ctid chains in action
- **Row finder** - locate rows by PK or TID, see storage location
- **No custom extension** - uses built-in `pageinspect` and `pgstattuple`
- **Single binary** - no dependencies

## Quick Start

```bash
make build
./bin/pg-storage-visualizer

# Or specify connection
./bin/pg-storage-visualizer -db "postgres://user:pass@localhost:5432/mydb"

open http://localhost:8080
```

## Docker

```bash
docker-compose up --build
```

| Service    | URL                                                  |
|------------|------------------------------------------------------|
| Visualizer | http://localhost:8080                                |
| PostgreSQL | `postgres://postgres:postgres@localhost:5433/demo`   |

Includes demo tables (`demo`, `hot_demo`) and required extensions pre-loaded.

```bash
# psql into the container
docker-compose exec db psql -U postgres demo
```

## Build Dependencies

[templ](https://templ.guide/) - HTML templating for Go:

```bash
# via go
go install github.com/a-h/templ/cmd/templ@latest

# via brew
brew install templ
```

## Requirements

PostgreSQL 13+ with extensions:

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;
CREATE EXTENSION IF NOT EXISTS pgstattuple;
```
