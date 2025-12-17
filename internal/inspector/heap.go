package inspector

import (
	"context"
	"fmt"
	"math"
	"strings"
)

const (
	pageSize   = 8192
	pageHeader = 24
	lpSize     = 4

	lpUnused   = 0
	lpNormal   = 1
	lpRedirect = 2
	lpDead     = 3
)

func (i *Inspector) ListTables(ctx context.Context) ([]TableInfo, error) {
	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("list-tables").Query())
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()

	var out []TableInfo
	for rows.Next() {
		var t TableInfo
		if err := rows.Scan(&t.Name, &t.Schema, &t.Size, &t.TotalPages, &t.RowCount, &t.DeadRows, &t.IndexCount); err != nil {
			return nil, fmt.Errorf("scan table: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (i *Inspector) GetTableStats(ctx context.Context, table string) (*TableStats, error) {
	var s TableStats
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("pgstattuple").Query(), table).Scan(
		&s.TableLen, &s.TupleCount, &s.TupleLen, &s.TuplePercent,
		&s.DeadTupleCount, &s.DeadTupleLen, &s.DeadTuplePercent,
		&s.FreeSpace, &s.FreePercent,
	)
	if err != nil {
		return nil, fmt.Errorf("pgstattuple %s: %w", table, err)
	}
	if math.IsNaN(s.TuplePercent) {
		s.TuplePercent = 0
	}
	if math.IsNaN(s.DeadTuplePercent) {
		s.DeadTuplePercent = 0
	}
	if math.IsNaN(s.FreePercent) {
		s.FreePercent = 0
	}
	return &s, nil
}

func (i *Inspector) GetTableColumns(ctx context.Context, table string) ([]ColumnInfo, error) {
	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("table-columns").Query(), table)
	if err != nil {
		return nil, fmt.Errorf("columns %s: %w", table, err)
	}
	defer rows.Close()

	var out []ColumnInfo
	for rows.Next() {
		var c ColumnInfo
		if err := rows.Scan(&c.Name, &c.Type, &c.Position, &c.NotNull, &c.IsPK); err != nil {
			return nil, fmt.Errorf("scan column: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (i *Inspector) GetTableIndexes(ctx context.Context, table string) ([]IndexInfo, error) {
	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("table-indexes").Query(), table)
	if err != nil {
		return nil, fmt.Errorf("indexes %s: %w", table, err)
	}
	defer rows.Close()

	var out []IndexInfo
	for rows.Next() {
		var idx IndexInfo
		if err := rows.Scan(&idx.Name, &idx.TableName, &idx.IndexType, &idx.Size, &idx.NumPages, &idx.IsUnique, &idx.IsPrimary, &idx.Columns); err != nil {
			return nil, fmt.Errorf("scan index: %w", err)
		}
		out = append(out, idx)
	}
	return out, rows.Err()
}

func (i *Inspector) GetTableDetail(ctx context.Context, table string) (*TableDetail, error) {
	tables, err := i.ListTables(ctx)
	if err != nil {
		return nil, err
	}

	var info TableInfo
	for _, t := range tables {
		if t.Name == table {
			info = t
			break
		}
	}
	if info.Name == "" {
		return nil, fmt.Errorf("table %s not found", table)
	}

	stats, err := i.GetTableStats(ctx, table)
	if err != nil {
		return nil, err
	}
	columns, err := i.GetTableColumns(ctx, table)
	if err != nil {
		return nil, err
	}
	indexes, err := i.GetTableIndexes(ctx, table)
	if err != nil {
		return nil, err
	}

	return &TableDetail{Info: info, Stats: *stats, Columns: columns, Indexes: indexes}, nil
}

func (i *Inspector) GetHeapPageDetail(ctx context.Context, table string, blockNo int) (*HeapPageDetail, error) {
	var totalPages int
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("table-page-count").Query(), table).Scan(&totalPages)
	if err != nil {
		return nil, fmt.Errorf("page count %s: %w", table, err)
	}

	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("heap-page-items").Query(), table, blockNo)
	if err != nil {
		return nil, fmt.Errorf("heap_page_items %s blk %d: %w", table, blockNo, err)
	}
	defer rows.Close()

	var tuples []HeapTuple
	var live, dead, lpDeadCnt int
	used := pageHeader

	for rows.Next() {
		var t HeapTuple
		var lpOff, mask, mask2 int
		if err := rows.Scan(&t.LP, &lpOff, &t.LPFlags, &t.ItemLen, &t.Xmin, &t.Xmax, &t.Ctid, &mask, &mask2); err != nil {
			return nil, fmt.Errorf("scan tuple: %w", err)
		}

		t.LPOffset = lpOff
		t.LPFlagsStr = lpFlagsStr(t.LPFlags)
		t.InfoMask = decodeInfoMask(mask, mask2)
		t.IsLive = t.LPFlags == lpNormal && t.Xmax == 0
		t.IsHot = hasFlag(t.InfoMask, "HEAP_HOT_UPDATED") || hasFlag(t.InfoMask, "HEAP_ONLY_TUPLE")
		t.IsUpdated = t.Xmax != 0

		used += lpSize
		switch t.LPFlags {
		case lpNormal:
			used += t.ItemLen
			if t.IsLive {
				live++
			} else {
				dead++
			}
		case lpDead:
			lpDeadCnt++
		}

		tuples = append(tuples, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	free := pageSize - used
	if free < 0 {
		free = 0
	}

	return &HeapPageDetail{
		Stats: HeapPageStats{
			BlockNo:     blockNo,
			TotalPages:  totalPages,
			LiveTuples:  live,
			DeadTuples:  dead,
			FreeSpace:   free,
			PageSize:    pageSize,
			LpCount:     len(tuples),
			LpDeadCount: lpDeadCnt,
		},
		Tuples: tuples,
	}, nil
}

func (i *Inspector) GetHeapPageWithAttrs(ctx context.Context, table string, blockNo int) (*HeapPageDetail, error) {
	detail, err := i.GetHeapPageDetail(ctx, table, blockNo)
	if err != nil {
		return nil, err
	}

	columns, err := i.GetTableColumns(ctx, table)
	if err != nil {
		return nil, err
	}

	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("heap-page-item-attrs").Query(), table, blockNo)
	if err != nil {
		return detail, nil
	}
	defer rows.Close()

	attrs := make(map[int][]string)
	for rows.Next() {
		var lp int
		var vals []string
		if err := rows.Scan(&lp, &vals); err != nil {
			continue
		}
		attrs[lp] = vals
	}

	for idx := range detail.Tuples {
		t := &detail.Tuples[idx]
		vals, ok := attrs[t.LP]
		if !ok {
			continue
		}
		t.Attrs = make(map[string]string)
		for j, v := range vals {
			if j >= len(columns) {
				break
			}
			if len(v) > 50 {
				v = v[:47] + "..."
			}
			t.Attrs[columns[j].Name] = v
		}
	}

	return detail, nil
}

func (i *Inspector) GetHeapPageMap(ctx context.Context, table string) (*HeapPageMap, error) {
	var total int
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("table-page-count").Query(), table).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("page count %s: %w", table, err)
	}
	if total == 0 {
		return &HeapPageMap{TableName: table}, nil
	}

	limit := total
	if limit > 500 {
		limit = 500
	}

	q := i.qs.MustHaveQuery("heap-page-stats").Query()
	pages := make([]HeapPageInfo, 0, total)

	for blk := 0; blk < limit; blk++ {
		var p HeapPageInfo
		var used, lps int64
		p.BlockNo = blk

		if err := i.pool.QueryRow(ctx, q, table, blk).Scan(&p.LiveTuples, &p.DeadTuples, &used, &lps); err != nil {
			continue
		}

		p.FreeSpace = pageSize - pageHeader - int(lps)*lpSize - int(used)
		if p.FreeSpace < 0 {
			p.FreeSpace = 0
		}
		p.Density = 100.0 * float64(pageSize-p.FreeSpace) / float64(pageSize)
		pages = append(pages, p)
	}

	// placeholder for unscanned pages
	for blk := limit; blk < total; blk++ {
		pages = append(pages, HeapPageInfo{BlockNo: blk, LiveTuples: -1, Density: 50})
	}

	return &HeapPageMap{TableName: table, Pages: pages}, nil
}

func (i *Inspector) GetPrimaryKeyColumn(ctx context.Context, table string) (string, error) {
	var pk string
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("primary-key-column").Query(), table).Scan(&pk)
	if err != nil {
		return "", fmt.Errorf("no pk for %s", table)
	}
	return pk, nil
}

func (i *Inspector) GetIndexedColumns(ctx context.Context, table string) (*IndexedColumnsInfo, error) {
	pk, _ := i.GetPrimaryKeyColumn(ctx, table)

	columns, err := i.GetTableColumns(ctx, table)
	if err != nil {
		return nil, err
	}

	colTypes := make(map[string]string, len(columns))
	for _, c := range columns {
		colTypes[c.Name] = c.Type
	}

	rows, err := i.pool.Query(ctx, i.qs.MustHaveQuery("indexed-columns").Query(), table)
	if err != nil {
		return nil, fmt.Errorf("indexed columns: %w", err)
	}
	defer rows.Close()

	indexedSet := make(map[string]bool)
	indexDetail := make(map[string]string)
	for rows.Next() {
		var col, idx string
		if err := rows.Scan(&col, &idx); err != nil {
			continue
		}
		indexedSet[col] = true
		indexDetail[col] = idx
	}

	var indexed, nonIndexed []string
	for _, c := range columns {
		if indexedSet[c.Name] {
			indexed = append(indexed, c.Name)
		} else {
			nonIndexed = append(nonIndexed, c.Name)
		}
	}

	return &IndexedColumnsInfo{
		PKColumn:       pk,
		IndexedColumns: indexed,
		NonIndexed:     nonIndexed,
		ColumnTypes:    colTypes,
		IndexDetails:   indexDetail,
	}, nil
}

func (i *Inspector) ExecuteDemoUpdate(ctx context.Context, table, pk, column, newVal string) (*DemoUpdateResult, error) {
	fail := func(msg string) *DemoUpdateResult {
		return &DemoUpdateResult{Success: false, Error: msg}
	}

	info, err := i.GetIndexedColumns(ctx, table)
	if err != nil {
		return fail(fmt.Sprintf("table info: %v", err)), nil
	}
	if _, ok := info.ColumnTypes[column]; !ok {
		return fail(fmt.Sprintf("column %s not found", column)), nil
	}
	if info.PKColumn == "" {
		return fail("table has no primary key"), nil
	}

	loc, err := i.FindRowByPK(ctx, table, pk)
	if err != nil || !loc.Found {
		return fail(fmt.Sprintf("row pk=%s not found", pk)), nil
	}

	beforePage, err := i.GetHeapPageDetail(ctx, table, loc.Page)
	if err != nil {
		return fail(fmt.Sprintf("page detail: %v", err)), nil
	}

	beforeTuple := findTuple(beforePage.Tuples, loc.Item)
	if beforeTuple == nil {
		return fail("tuple not on page"), nil
	}

	var oldVal string
	q := fmt.Sprintf("SELECT %s::text FROM %s WHERE %s = $1", column, table, info.PKColumn)
	_ = i.pool.QueryRow(ctx, q, pk).Scan(&oldVal)

	before := tupleState(loc, beforeTuple)

	updateQ := fmt.Sprintf("UPDATE %s SET %s = $1 WHERE %s = $2", table, column, info.PKColumn)
	if _, err := i.pool.Exec(ctx, updateQ, newVal, pk); err != nil {
		return fail(fmt.Sprintf("update: %v", err)), nil
	}

	afterPage, err := i.GetHeapPageDetail(ctx, table, loc.Page)
	if err != nil {
		return fail(fmt.Sprintf("page after: %v", err)), nil
	}
	afterTuple := findTuple(afterPage.Tuples, loc.Item)

	after := DemoTupleState{}
	if afterTuple != nil {
		after = tupleState(loc, afterTuple)
	}

	searchPK := pk
	if column == info.PKColumn {
		searchPK = newVal
	}

	newLoc, err := i.FindRowByPK(ctx, table, searchPK)
	if err != nil || !newLoc.Found {
		return fail("new tuple not found"), nil
	}

	newPage, err := i.GetHeapPageDetail(ctx, table, newLoc.Page)
	if err != nil {
		return fail(fmt.Sprintf("new page: %v", err)), nil
	}
	newTuple := findTuple(newPage.Tuples, newLoc.Item)

	var newState *DemoTupleState
	if newTuple != nil {
		s := tupleState(newLoc, newTuple)
		newState = &s
	}

	samePage := loc.Page == newLoc.Page
	isHot := samePage && hasFlag(after.InfoMask, "HEAP_HOT_UPDATED")

	// Check if the column is actually indexed
	isColumnIndexed := false
	for _, ic := range info.IndexedColumns {
		if ic == column {
			isColumnIndexed = true
			break
		}
	}

	updateType := "regular"
	if isHot {
		updateType = "hot"
	}

	explanation := buildExplanation(isHot, samePage, isColumnIndexed, loc, newLoc, column)

	return &DemoUpdateResult{
		Success:         true,
		UpdateType:      updateType,
		Column:          column,
		IsColumnIndexed: isColumnIndexed,
		OldValue:        oldVal,
		NewValue:        newVal,
		Before:          before,
		After:           after,
		NewTuple:        newState,
		SamePage:        samePage,
		Explanation:     explanation,
	}, nil
}

func (i *Inspector) GetRowWithData(ctx context.Context, table, pk string) (map[string]interface{}, error) {
	loc, err := i.FindRowByPK(ctx, table, pk)
	if err != nil || !loc.Found {
		return nil, fmt.Errorf("row not found")
	}

	info, err := i.GetIndexedColumns(ctx, table)
	if err != nil {
		return nil, err
	}
	if info.PKColumn == "" {
		return nil, fmt.Errorf("no primary key")
	}

	columns, err := i.GetTableColumns(ctx, table)
	if err != nil {
		return nil, err
	}

	colNames := make([]string, len(columns))
	for j, c := range columns {
		colNames[j] = c.Name + "::text"
	}

	q := fmt.Sprintf("SELECT %s FROM %s WHERE %s = $1", strings.Join(colNames, ", "), table, info.PKColumn)
	row := i.pool.QueryRow(ctx, q, pk)

	vals := make([]interface{}, len(columns))
	ptrs := make([]interface{}, len(columns))
	for j := range vals {
		ptrs[j] = &vals[j]
	}
	if err := row.Scan(ptrs...); err != nil {
		return nil, err
	}

	colData := make(map[string]interface{}, len(columns))
	for j, c := range columns {
		colData[c.Name] = vals[j]
	}

	page, err := i.GetHeapPageDetail(ctx, table, loc.Page)
	if err != nil {
		return nil, err
	}
	tuple := findTuple(page.Tuples, loc.Item)

	result := map[string]interface{}{
		"found":      true,
		"pkColumn":   info.PKColumn,
		"pkValue":    pk,
		"columnData": colData,
		"tid":        loc.TID,
		"page":       loc.Page,
		"item":       loc.Item,
		"xmin":       loc.Xmin,
		"xmax":       loc.Xmax,
		"isLive":     loc.IsLive,
		"ctid":       "",
		"infoMask":   []string{},
	}
	if tuple != nil {
		result["ctid"] = tuple.Ctid
		result["infoMask"] = tuple.InfoMask
		result["isHot"] = tuple.IsHot
	}
	return result, nil
}

func (i *Inspector) FindRowByPK(ctx context.Context, table, pkVal string) (*RowLocation, error) {
	var pkCol string
	err := i.pool.QueryRow(ctx, i.qs.MustHaveQuery("find-row-pk-column").Query(), table).Scan(&pkCol)
	if err != nil {
		return &RowLocation{}, nil
	}

	q := fmt.Sprintf(`SELECT ctid, xmin::text::bigint, xmax::text::bigint, pg_column_size(t.*) FROM %s t WHERE %s = $1 LIMIT 1`, table, pkCol)

	var ctid string
	var xmin, xmax int64
	var size int
	if err := i.pool.QueryRow(ctx, q, pkVal).Scan(&ctid, &xmin, &xmax, &size); err != nil {
		return &RowLocation{}, nil
	}

	var page, item int
	fmt.Sscanf(ctid, "(%d,%d)", &page, &item)

	return &RowLocation{
		Found:     true,
		Page:      page,
		Item:      item,
		TID:       ctid,
		Xmin:      xmin,
		Xmax:      xmax,
		IsLive:    xmax == 0,
		TupleSize: size,
	}, nil
}

func (i *Inspector) FindRowByTID(ctx context.Context, table string, page, item int) (*RowLocation, error) {
	columns, err := i.GetTableColumns(ctx, table)
	if err != nil {
		return &RowLocation{}, nil
	}

	colNames := make([]string, len(columns))
	for j, c := range columns {
		colNames[j] = c.Name + "::text"
	}

	q := fmt.Sprintf(`SELECT ctid, xmin::text::bigint, xmax::text::bigint, pg_column_size(t.*), %s FROM %s t WHERE ctid = $1::tid LIMIT 1`,
		strings.Join(colNames, ", "), table)

	tid := fmt.Sprintf("(%d,%d)", page, item)

	var ctid string
	var xmin, xmax int64
	var size int
	vals := make([]interface{}, len(columns))
	ptrs := make([]interface{}, len(columns))
	for j := range vals {
		ptrs[j] = &vals[j]
	}

	targets := append([]interface{}{&ctid, &xmin, &xmax, &size}, ptrs...)
	if err := i.pool.QueryRow(ctx, q, tid).Scan(targets...); err != nil {
		return &RowLocation{}, nil
	}

	colData := make(map[string]string, len(columns))
	for j, c := range columns {
		if vals[j] != nil {
			colData[c.Name] = fmt.Sprintf("%v", vals[j])
		}
	}

	return &RowLocation{
		Found:      true,
		Page:       page,
		Item:       item,
		TID:        ctid,
		Xmin:       xmin,
		Xmax:       xmax,
		IsLive:     xmax == 0,
		TupleSize:  size,
		ColumnData: colData,
	}, nil
}

// helpers

func findTuple(tuples []HeapTuple, lp int) *HeapTuple {
	for idx := range tuples {
		if tuples[idx].LP == lp {
			return &tuples[idx]
		}
	}
	return nil
}

func tupleState(loc *RowLocation, t *HeapTuple) DemoTupleState {
	return DemoTupleState{
		TID:       fmt.Sprintf("(%d,%d)", loc.Page, loc.Item),
		Page:      loc.Page,
		Item:      loc.Item,
		Xmin:      t.Xmin,
		Xmax:      t.Xmax,
		Ctid:      t.Ctid,
		InfoMask:  t.InfoMask,
		IsLive:    t.IsLive,
		IsHot:     t.IsHot,
		IsUpdated: t.IsUpdated,
	}
}

func buildExplanation(isHot, samePage, isColumnIndexed bool, before, after *RowLocation, col string) string {
	if isHot {
		if isColumnIndexed {
			// This shouldn't happen - HOT with indexed column change
			return fmt.Sprintf(
				"🔥 HOT UPDATE (unexpected): column '%s' IS indexed but PostgreSQL used HOT. Value may be bitwise identical, or check if index exists. Page %d, lp %d→%d.",
				col, before.Page, before.Item, after.Item)
		}
		return fmt.Sprintf(
			"🔥 HOT UPDATE: column '%s' is not indexed, so no index update needed. New tuple on same page (%d), lp %d→%d.",
			col, before.Page, before.Item, after.Item)
	}
	if samePage {
		return fmt.Sprintf(
			"📦 REGULAR UPDATE (same page %d): column '%s' is indexed, index was updated. lp %d→%d.",
			before.Page, col, before.Item, after.Item)
	}
	return fmt.Sprintf(
		"📦 REGULAR UPDATE: tuple moved from page %d (lp=%d) to page %d (lp=%d). Index updated.",
		before.Page, before.Item, after.Page, after.Item)
}

func lpFlagsStr(f int) string {
	switch f {
	case lpUnused:
		return "LP_UNUSED"
	case lpNormal:
		return "LP_NORMAL"
	case lpRedirect:
		return "LP_REDIRECT"
	case lpDead:
		return "LP_DEAD"
	default:
		return fmt.Sprintf("LP_%d", f)
	}
}

func decodeInfoMask(m, m2 int) []string {
	type flag struct {
		mask int
		name string
	}
	flags := []flag{
		{0x0001, "HEAP_HASNULL"},
		{0x0002, "HEAP_HASVARWIDTH"},
		{0x0004, "HEAP_HASEXTERNAL"},
		{0x0008, "HEAP_HASOID_OLD"},
		{0x0010, "HEAP_XMAX_KEYSHR_LOCK"},
		{0x0020, "HEAP_COMBOCID"},
		{0x0040, "HEAP_XMAX_EXCL_LOCK"},
		{0x0080, "HEAP_XMAX_LOCK_ONLY"},
		{0x0100, "HEAP_XMIN_COMMITTED"},
		{0x0200, "HEAP_XMIN_INVALID"},
		{0x0400, "HEAP_XMAX_COMMITTED"},
		{0x0800, "HEAP_XMAX_INVALID"},
		{0x1000, "HEAP_XMAX_IS_MULTI"},
		{0x2000, "HEAP_UPDATED"},
		{0x4000, "HEAP_MOVED_OFF"},
		{0x8000, "HEAP_MOVED_IN"},
	}
	flags2 := []flag{
		{0x4000, "HEAP_HOT_UPDATED"},
		{0x8000, "HEAP_ONLY_TUPLE"},
	}

	var out []string
	for _, f := range flags {
		if m&f.mask != 0 {
			out = append(out, f.name)
		}
	}
	for _, f := range flags2 {
		if m2&f.mask != 0 {
			out = append(out, f.name)
		}
	}
	return out
}

func hasFlag(flags []string, name string) bool {
	for _, f := range flags {
		if strings.EqualFold(f, name) {
			return true
		}
	}
	return false
}
