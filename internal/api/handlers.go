package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/boringsql/pg-storage-visualizer/internal/inspector"
)

type Handler struct {
	inspector *inspector.Inspector
}

func NewHandler(insp *inspector.Inspector) *Handler {
	return &Handler{inspector: insp}
}

func (h *Handler) json(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (h *Handler) err(w http.ResponseWriter, status int, msg string) {
	log.Printf("api error [%d]: %s", status, msg)
	h.json(w, status, map[string]string{"error": msg})
}

func (h *Handler) ListIndexes(w http.ResponseWriter, r *http.Request) {
	out, err := h.inspector.ListIndexes(r.Context())
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetIndexMeta(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	out, err := h.inspector.GetMeta(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetIndexStats(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	out, err := h.inspector.GetIndexStats(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetPageDetail(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	blk, err := strconv.Atoi(r.PathValue("blockno"))
	if err != nil {
		h.err(w, 400, "invalid block number")
		return
	}
	out, err := h.inspector.GetPageDetail(r.Context(), name, blk)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetTreeStructure(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	depth := 2
	if s := r.URL.Query().Get("depth"); s != "" {
		if d, err := strconv.Atoi(s); err == nil && d > 0 {
			depth = d
		}
	}
	out, err := h.inspector.GetTreeStructure(r.Context(), name, depth)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetBloatInfo(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	out, err := h.inspector.GetBloatInfo(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetPageDensityMap(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	out, err := h.inspector.GetPageDensityMap(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	if out.Pages == nil {
		out.Pages = []inspector.PageDensity{}
	}
	h.json(w, 200, out)
}

func (h *Handler) GetAllPageStats(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "index name required")
		return
	}
	out, err := h.inspector.GetAllPageStats(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) ListTables(w http.ResponseWriter, r *http.Request) {
	out, err := h.inspector.ListTables(r.Context())
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	if out == nil {
		out = []inspector.TableInfo{}
	}
	h.json(w, 200, out)
}

func (h *Handler) GetTableDetail(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	out, err := h.inspector.GetTableDetail(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetTableStats(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	out, err := h.inspector.GetTableStats(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetHeapPageDetail(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	blk, err := strconv.Atoi(r.PathValue("blockno"))
	if err != nil {
		h.err(w, 400, "invalid block number")
		return
	}
	var out *inspector.HeapPageDetail
	if r.URL.Query().Get("attrs") == "true" {
		out, err = h.inspector.GetHeapPageWithAttrs(r.Context(), name, blk)
	} else {
		out, err = h.inspector.GetHeapPageDetail(r.Context(), name, blk)
	}
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetHeapPageMap(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	out, err := h.inspector.GetHeapPageMap(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) FindRow(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	tid := r.URL.Query().Get("tid")
	pk := r.URL.Query().Get("pk")

	var out *inspector.RowLocation
	var err error

	switch {
	case tid != "":
		var page, item int
		if _, e := fmt.Sscanf(tid, "(%d,%d)", &page, &item); e != nil {
			fmt.Sscanf(tid, "%d,%d", &page, &item)
		}
		if page == 0 && item == 0 {
			h.err(w, 400, "invalid TID format")
			return
		}
		out, err = h.inspector.FindRowByTID(r.Context(), name, page, item)
	case pk != "":
		out, err = h.inspector.FindRowByPK(r.Context(), name, pk)
	default:
		h.err(w, 400, "pk or tid required")
		return
	}
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

type demoUpdateReq struct {
	PK       string `json:"pk"`
	Column   string `json:"column"`
	NewValue string `json:"newValue"`
}

func (h *Handler) DemoUpdate(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	var req demoUpdateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.err(w, 400, "invalid request body")
		return
	}
	if req.PK == "" || req.Column == "" {
		h.err(w, 400, "pk and column required")
		return
	}
	out, err := h.inspector.ExecuteDemoUpdate(r.Context(), name, req.PK, req.Column, req.NewValue)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) DemoGetRow(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	pk := r.URL.Query().Get("pk")
	if name == "" || pk == "" {
		h.err(w, 400, "table name and pk required")
		return
	}
	out, err := h.inspector.GetRowWithData(r.Context(), name, pk)
	if err != nil {
		h.json(w, 200, map[string]bool{"found": false})
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetIndexedColumns(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.err(w, 400, "table name required")
		return
	}
	out, err := h.inspector.GetIndexedColumns(r.Context(), name)
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}

func (h *Handler) GetMVCCInfo(w http.ResponseWriter, r *http.Request) {
	out, err := h.inspector.GetMVCCInfo(r.Context())
	if err != nil {
		h.err(w, 500, err.Error())
		return
	}
	h.json(w, 200, out)
}
