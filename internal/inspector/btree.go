package inspector

import (
	"context"
	"fmt"
	"math"

	"github.com/boringsql/queries"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Inspector struct {
	pool *pgxpool.Pool
	qs   *queries.QueryStore
}

func New(pool *pgxpool.Pool, qs *queries.QueryStore) *Inspector {
	return &Inspector{pool: pool, qs: qs}
}

func (i *Inspector) ListIndexes(ctx context.Context) ([]IndexInfo, error) {
	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("list-indexes").Query())
	if err != nil {
		return nil, fmt.Errorf("list indexes: %w", err)
	}
	defer rows.Close()

	var out []IndexInfo
	for rows.Next() {
		var idx IndexInfo
		err := rows.Scan(&idx.Name, &idx.TableName, &idx.IndexType, &idx.Size, &idx.NumPages, &idx.IsUnique, &idx.IsPrimary)
		if err != nil {
			return nil, fmt.Errorf("scan index: %w", err)
		}
		out = append(out, idx)
	}
	return out, rows.Err()
}

func (i *Inspector) GetMeta(ctx context.Context, indexName string) (*BTreeMeta, error) {
	var m BTreeMeta
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("bt-metap").Query(), indexName).Scan(
		&m.Magic, &m.Version, &m.Root, &m.Level, &m.FastRoot, &m.FastLevel,
	)
	if err != nil {
		return nil, fmt.Errorf("bt_metap %s: %w", indexName, err)
	}
	return &m, nil
}

func (i *Inspector) GetPageStats(ctx context.Context, indexName string, blockNo int) (*PageStats, error) {
	var s PageStats
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("bt-page-stats").Query(), indexName, blockNo).Scan(
		&s.BlockNo, &s.Type, &s.LiveItems, &s.DeadItems, &s.AvgItemSize,
		&s.PageSize, &s.FreeSize, &s.BtpoPrev, &s.BtpoNext, &s.BtpoLevel, &s.BtpoFlags,
	)
	if err != nil {
		return nil, fmt.Errorf("bt_page_stats %s blk %d: %w", indexName, blockNo, err)
	}
	return &s, nil
}

func (i *Inspector) GetPageItems(ctx context.Context, indexName string, blockNo int) ([]PageItem, error) {
	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("bt-page-items").Query(), indexName, blockNo)
	if err != nil {
		return nil, fmt.Errorf("bt_page_items %s blk %d: %w", indexName, blockNo, err)
	}
	defer rows.Close()

	var out []PageItem
	for rows.Next() {
		var item PageItem
		var htid, tids *string
		err := rows.Scan(&item.ItemOffset, &item.Ctid, &item.ItemLen, &item.Nulls, &item.Vars, &item.Data, &item.Dead, &htid, &tids)
		if err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		if htid != nil {
			item.Htid = *htid
		}
		if tids != nil {
			item.Tids = *tids
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (i *Inspector) GetPageDetail(ctx context.Context, indexName string, blockNo int) (*PageDetail, error) {
	stats, err := i.GetPageStats(ctx, indexName, blockNo)
	if err != nil {
		return nil, err
	}
	items, err := i.GetPageItems(ctx, indexName, blockNo)
	if err != nil {
		return nil, err
	}
	return &PageDetail{Stats: *stats, Items: items}, nil
}

func (i *Inspector) GetIndexStats(ctx context.Context, indexName string) (*IndexStats, error) {
	var s IndexStats
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("pgstatindex").Query(), indexName).Scan(
		&s.Version, &s.TreeLevel, &s.IndexSize, &s.RootBlockNo,
		&s.InternalPages, &s.LeafPages, &s.EmptyPages, &s.DeletedPages,
		&s.AvgLeafDensity, &s.LeafFragmentation,
	)
	if err != nil {
		return nil, fmt.Errorf("pgstatindex %s: %w", indexName, err)
	}
	if math.IsNaN(s.AvgLeafDensity) {
		s.AvgLeafDensity = 0
	}
	if math.IsNaN(s.LeafFragmentation) {
		s.LeafFragmentation = 0
	}
	return &s, nil
}

func (i *Inspector) GetAllPageStats(ctx context.Context, indexName string) ([]PageStats, error) {
	var numPages int
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("index-page-count").Query(), indexName).Scan(&numPages)
	if err != nil {
		return nil, fmt.Errorf("page count %s: %w", indexName, err)
	}
	if numPages <= 1 {
		return nil, nil
	}

	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("all-page-stats").Query(), indexName, numPages)
	if err != nil {
		return nil, fmt.Errorf("all page stats %s: %w", indexName, err)
	}
	defer rows.Close()

	var out []PageStats
	for rows.Next() {
		var s PageStats
		err := rows.Scan(
			&s.BlockNo, &s.Type, &s.LiveItems, &s.DeadItems, &s.AvgItemSize,
			&s.PageSize, &s.FreeSize, &s.BtpoPrev, &s.BtpoNext, &s.BtpoLevel, &s.BtpoFlags,
		)
		if err != nil {
			return nil, fmt.Errorf("scan stats: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (i *Inspector) GetPageDensityMap(ctx context.Context, indexName string) (*PageDensityMap, error) {
	stats, err := i.GetAllPageStats(ctx, indexName)
	if err != nil {
		return nil, err
	}

	pages := make([]PageDensity, len(stats))
	for idx, s := range stats {
		density := 0.0
		if s.PageSize > 0 {
			density = 100.0 * float64(s.PageSize-s.FreeSize) / float64(s.PageSize)
		}
		pages[idx] = PageDensity{
			BlockNo:   s.BlockNo,
			Level:     s.BtpoLevel,
			Type:      s.Type,
			Density:   density,
			LiveItems: s.LiveItems,
			DeadItems: s.DeadItems,
		}
	}
	return &PageDensityMap{IndexName: indexName, Pages: pages}, nil
}

func (i *Inspector) GetBloatInfo(ctx context.Context, indexName string) (*BloatInfo, error) {
	stats, err := i.GetIndexStats(ctx, indexName)
	if err != nil {
		return nil, err
	}

	total := stats.InternalPages + stats.LeafPages + stats.EmptyPages + stats.DeletedPages
	if total == 0 {
		return &BloatInfo{IndexName: indexName, RecommendAction: "ok"}, nil
	}

	wasted := stats.EmptyPages + stats.DeletedPages

	// estimate waste from low density (well-packed should be ~90%)
	densityWaste := 0.0
	if stats.AvgLeafDensity < 90 && stats.LeafPages > 0 {
		densityWaste = (90 - stats.AvgLeafDensity) / 100.0 * float64(stats.LeafPages)
	}

	bloat := (float64(wasted) + densityWaste) / float64(total) * 100
	wastedBytes := int64(float64(stats.IndexSize) * bloat / 100)

	action := "ok"
	if bloat >= 30 {
		action = "reindex"
	} else if bloat >= 10 {
		action = "vacuum"
	}

	return &BloatInfo{
		IndexName:       indexName,
		TotalPages:      total,
		EmptyPages:      stats.EmptyPages,
		DeletedPages:    stats.DeletedPages,
		AvgDensity:      stats.AvgLeafDensity,
		EstimatedBloat:  bloat,
		WastedBytes:     wastedBytes,
		RecommendAction: action,
	}, nil
}

func (i *Inspector) GetTreeStructure(ctx context.Context, indexName string, maxDepth int) (*TreeNode, error) {
	meta, err := i.GetMeta(ctx, indexName)
	if err != nil {
		return nil, err
	}
	return i.buildTreeNode(ctx, indexName, meta.Root, meta.Level, maxDepth)
}

func (i *Inspector) buildTreeNode(ctx context.Context, indexName string, blockNo, level, maxDepth int) (*TreeNode, error) {
	stats, err := i.GetPageStats(ctx, indexName, blockNo)
	if err != nil {
		return nil, err
	}

	nodeType := "leaf"
	switch {
	case level == stats.BtpoLevel && stats.BtpoPrev == 0 && stats.BtpoNext == 0:
		nodeType = "root"
	case stats.BtpoLevel > 0:
		nodeType = "internal"
	}

	node := &TreeNode{
		BlockNo:   blockNo,
		Level:     stats.BtpoLevel,
		Type:      nodeType,
		LiveItems: stats.LiveItems,
		DeadItems: stats.DeadItems,
		FreeSize:  stats.FreeSize,
		PageSize:  stats.PageSize,
		Density:   100.0 * float64(stats.PageSize-stats.FreeSize) / float64(stats.PageSize),
	}

	if stats.BtpoLevel == 0 || maxDepth <= 0 {
		return node, nil
	}

	items, err := i.GetPageItems(ctx, indexName, blockNo)
	if err != nil {
		return nil, err
	}

	if len(items) > 0 && stats.BtpoNext != 0 {
		node.HighKey = items[0].Data
	}

	for _, item := range items {
		var childBlock int
		if _, err := fmt.Sscanf(item.Ctid, "(%d,", &childBlock); err != nil {
			continue
		}
		child, err := i.buildTreeNode(ctx, indexName, childBlock, level, maxDepth-1)
		if err != nil {
			continue
		}
		node.Children = append(node.Children, *child)
	}

	return node, nil
}

func (i *Inspector) GetMVCCInfo(ctx context.Context) (*MVCCInfo, error) {
	var xid int64
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("txid-current").Query()).Scan(&xid)
	if err != nil {
		return nil, fmt.Errorf("txid_current: %w", err)
	}

	var snapshot string
	_ = i.pool.QueryRow(ctx, i.qs.MustHaveQuery("txid-current-snapshot").Query()).Scan(&snapshot)

	var xmin, xmax int64
	if snapshot != "" {
		fmt.Sscanf(snapshot, "%d:%d:", &xmin, &xmax)
	}

	return &MVCCInfo{
		CurrentXID:      xid,
		CurrentSnapshot: snapshot,
		XIDMin:          xmin,
		XIDMax:          xmax,
	}, nil
}
