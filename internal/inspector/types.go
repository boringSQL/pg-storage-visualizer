package inspector

type BTreeMeta struct {
	Magic                int   `json:"magic"`
	Version              int   `json:"version"`
	Root                 int   `json:"root"`
	Level                int   `json:"level"`
	FastRoot             int   `json:"fastRoot"`
	FastLevel            int   `json:"fastLevel"`
	OldestXact           int64 `json:"oldestXact"`
	LastCleanupNumTuples int64 `json:"lastCleanupNumTuples"`
	AllequalImage        bool  `json:"allequalImage"`
}

type PageStats struct {
	BlockNo     int    `json:"blockNo"`
	Type        string `json:"type"`
	LiveItems   int    `json:"liveItems"`
	DeadItems   int    `json:"deadItems"`
	AvgItemSize int    `json:"avgItemSize"`
	PageSize    int    `json:"pageSize"`
	FreeSize    int    `json:"freeSize"`
	BtpoPrev    int    `json:"btpoPrev"`
	BtpoNext    int    `json:"btpoNext"`
	BtpoLevel   int    `json:"btpoLevel"`
	BtpoFlags   int    `json:"btpoFlags"`
}

type PageItem struct {
	ItemOffset int    `json:"itemOffset"`
	Ctid       string `json:"ctid"`
	ItemLen    int    `json:"itemLen"`
	Nulls      bool   `json:"nulls"`
	Vars       bool   `json:"vars"`
	Data       string `json:"data"`
	Dead       bool   `json:"dead"`
	Htid       string `json:"htid"`
	Tids       string `json:"tids"`
}

type PageDetail struct {
	Stats PageStats  `json:"stats"`
	Items []PageItem `json:"items"`
}

type IndexStats struct {
	Version           int     `json:"version"`
	TreeLevel         int     `json:"treeLevel"`
	IndexSize         int64   `json:"indexSize"`
	RootBlockNo       int     `json:"rootBlockNo"`
	InternalPages     int64   `json:"internalPages"`
	LeafPages         int64   `json:"leafPages"`
	EmptyPages        int64   `json:"emptyPages"`
	DeletedPages      int64   `json:"deletedPages"`
	AvgLeafDensity    float64 `json:"avgLeafDensity"`
	LeafFragmentation float64 `json:"leafFragmentation"`
}

type IndexInfo struct {
	Name      string   `json:"name"`
	TableName string   `json:"tableName"`
	IndexType string   `json:"indexType"`
	Size      int64    `json:"size"`
	NumPages  int64    `json:"numPages"`
	IsUnique  bool     `json:"isUnique"`
	IsPrimary bool     `json:"isPrimary"`
	Columns   []string `json:"columns"`
}

type RowLocation struct {
	Found      bool              `json:"found"`
	Page       int               `json:"page"`
	Item       int               `json:"item"`
	TID        string            `json:"tid"`
	Xmin       int64             `json:"xmin"`
	Xmax       int64             `json:"xmax"`
	IsLive     bool              `json:"isLive"`
	TupleSize  int               `json:"tupleSize"`
	ColumnData map[string]string `json:"columnData,omitempty"`
}

type DemoTupleState struct {
	TID       string   `json:"tid"`
	Page      int      `json:"page"`
	Item      int      `json:"item"`
	Xmin      int64    `json:"xmin"`
	Xmax      int64    `json:"xmax"`
	Ctid      string   `json:"ctid"`
	InfoMask  []string `json:"infoMask"`
	IsLive    bool     `json:"isLive"`
	IsHot     bool     `json:"isHot"`
	IsUpdated bool     `json:"isUpdated"`
}

type DemoUpdateResult struct {
	Success         bool            `json:"success"`
	Error           string          `json:"error,omitempty"`
	UpdateType      string          `json:"updateType"`
	Column          string          `json:"column"`
	IsColumnIndexed bool            `json:"isColumnIndexed"`
	OldValue        string          `json:"oldValue"`
	NewValue        string          `json:"newValue"`
	Before          DemoTupleState  `json:"before"`
	After           DemoTupleState  `json:"after"`
	NewTuple        *DemoTupleState `json:"newTuple"`
	SamePage        bool            `json:"samePage"`
	Explanation     string          `json:"explanation"`
}

type TreeNode struct {
	BlockNo   int        `json:"blockNo"`
	Level     int        `json:"level"`
	Type      string     `json:"type"`
	LiveItems int        `json:"liveItems"`
	DeadItems int        `json:"deadItems"`
	FreeSize  int        `json:"freeSize"`
	PageSize  int        `json:"pageSize"`
	Density   float64    `json:"density"`
	Children  []TreeNode `json:"children,omitempty"`
	HighKey   string     `json:"highKey,omitempty"`
}

type BloatInfo struct {
	IndexName       string  `json:"indexName"`
	TotalPages      int64   `json:"totalPages"`
	EmptyPages      int64   `json:"emptyPages"`
	DeletedPages    int64   `json:"deletedPages"`
	AvgDensity      float64 `json:"avgDensity"`
	EstimatedBloat  float64 `json:"estimatedBloat"`
	WastedBytes     int64   `json:"wastedBytes"`
	RecommendAction string  `json:"recommendAction"`
}

type PageDensityMap struct {
	IndexName string        `json:"indexName"`
	Pages     []PageDensity `json:"pages"`
}

type PageDensity struct {
	BlockNo   int     `json:"blockNo"`
	Level     int     `json:"level"`
	Type      string  `json:"type"`
	Density   float64 `json:"density"`
	LiveItems int     `json:"liveItems"`
	DeadItems int     `json:"deadItems"`
}

type TableInfo struct {
	Name       string `json:"name"`
	Schema     string `json:"schema"`
	Size       int64  `json:"size"`
	TotalPages int64  `json:"totalPages"`
	RowCount   int64  `json:"rowCount"`
	DeadRows   int64  `json:"deadRows"`
	IndexCount int    `json:"indexCount"`
}

type TableStats struct {
	TableLen         int64   `json:"tableLen"`
	TupleCount       int64   `json:"tupleCount"`
	TupleLen         int64   `json:"tupleLen"`
	TuplePercent     float64 `json:"tuplePercent"`
	DeadTupleCount   int64   `json:"deadTupleCount"`
	DeadTupleLen     int64   `json:"deadTupleLen"`
	DeadTuplePercent float64 `json:"deadTuplePercent"`
	FreeSpace        int64   `json:"freeSpace"`
	FreePercent      float64 `json:"freePercent"`
}

type ColumnInfo struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Position int    `json:"position"`
	NotNull  bool   `json:"notNull"`
	IsPK     bool   `json:"isPK"`
}

type TableDetail struct {
	Info    TableInfo    `json:"info"`
	Stats   TableStats   `json:"stats"`
	Columns []ColumnInfo `json:"columns"`
	Indexes []IndexInfo  `json:"indexes"`
}

type HeapPageStats struct {
	BlockNo     int `json:"blockNo"`
	TotalPages  int `json:"totalPages"`
	LiveTuples  int `json:"liveTuples"`
	DeadTuples  int `json:"deadTuples"`
	FreeSpace   int `json:"freeSpace"`
	PageSize    int `json:"pageSize"`
	LpCount     int `json:"lpCount"`
	LpDeadCount int `json:"lpDeadCount"`
}

type HeapTuple struct {
	LP         int               `json:"lp"`
	LPOffset   int               `json:"lpOffset"`
	LPFlags    int               `json:"lpFlags"`
	LPFlagsStr string            `json:"lpFlagsStr"`
	ItemLen    int               `json:"itemLen"`
	Xmin       int64             `json:"xmin"`
	Xmax       int64             `json:"xmax"`
	Ctid       string            `json:"ctid"`
	InfoMask   []string          `json:"infoMask"`
	IsLive     bool              `json:"isLive"`
	IsHot      bool              `json:"isHot"`
	IsUpdated  bool              `json:"isUpdated"`
	Attrs      map[string]string `json:"attrs"`
}

type HeapPageDetail struct {
	Stats  HeapPageStats `json:"stats"`
	Tuples []HeapTuple   `json:"tuples"`
}

type HeapPageMap struct {
	TableName string         `json:"tableName"`
	Pages     []HeapPageInfo `json:"pages"`
}

type HeapPageInfo struct {
	BlockNo    int     `json:"blockNo"`
	LiveTuples int     `json:"liveTuples"`
	DeadTuples int     `json:"deadTuples"`
	FreeSpace  int     `json:"freeSpace"`
	Density    float64 `json:"density"`
}

type IndexedColumnsInfo struct {
	PKColumn       string            `json:"pkColumn"`
	IndexedColumns []string          `json:"indexedColumns"`
	NonIndexed     []string          `json:"nonIndexedColumns"`
	ColumnTypes    map[string]string `json:"columnTypes"`
	IndexDetails   map[string]string `json:"indexDetails"`
}

type MVCCInfo struct {
	CurrentXID      int64   `json:"currentXid"`
	CurrentSnapshot string  `json:"currentSnapshot"`
	XIDMin          int64   `json:"xidMin"`
	XIDMax          int64   `json:"xidMax"`
	ActiveXIDs      []int64 `json:"activeXids"`
}
