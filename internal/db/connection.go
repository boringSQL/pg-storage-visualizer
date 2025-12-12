package db

import (
	"context"
	"embed"
	"fmt"

	"github.com/boringsql/queries"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/*.sql
var sqlFS embed.FS

type DB struct {
	pool    *pgxpool.Pool
	Queries *queries.QueryStore
}

func New(ctx context.Context, connString string) (*DB, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	qs := queries.NewQueryStore()
	if err := qs.LoadFromEmbed(sqlFS, "sql"); err != nil {
		pool.Close()
		return nil, fmt.Errorf("load queries: %w", err)
	}

	return &DB{pool: pool, Queries: qs}, nil
}

func (d *DB) Close() {
	d.pool.Close()
}

func (d *DB) Pool() *pgxpool.Pool {
	return d.pool
}

func (d *DB) EnsureExtensions(ctx context.Context) error {
	q := d.Queries.MustHaveQuery("extension-exists")
	for _, ext := range []string{"pageinspect", "pgstattuple"} {
		var exists bool
		if err := d.pool.QueryRow(ctx, q.Query(), ext).Scan(&exists); err != nil {
			return fmt.Errorf("check extension %s: %w", ext, err)
		}
		if !exists {
			return fmt.Errorf("extension '%s' not installed, run: CREATE EXTENSION %s", ext, ext)
		}
	}
	return nil
}
