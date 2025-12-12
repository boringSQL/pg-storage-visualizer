package api

import (
	"net/http"

	"github.com/boringsql/pg-storage-visualizer/web/templates"
)

func (h *Handler) HTMXMVCCInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	info, err := h.inspector.GetMVCCInfo(r.Context())
	if err != nil {
		templates.MVCCError(err.Error()).Render(r.Context(), w)
		return
	}

	templates.MVCCInfo(templates.MVCCData{
		CurrentXID:      info.CurrentXID,
		CurrentSnapshot: info.CurrentSnapshot,
		XIDMin:          info.XIDMin,
		XIDMax:          info.XIDMax,
	}).Render(r.Context(), w)
}

func (h *Handler) HTMXTableList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	tables, err := h.inspector.ListTables(r.Context())
	if err != nil {
		w.Write([]byte(`<div style="color: var(--red-400);">Failed to load tables</div>`))
		return
	}

	out := make([]templates.TableInfo, len(tables))
	for i, t := range tables {
		out[i] = templates.TableInfo{
			Name:     t.Name,
			RowCount: t.RowCount,
			DeadRows: t.DeadRows,
			Size:     t.Size,
		}
	}

	templates.TableList(out, r.URL.Query().Get("current")).Render(r.Context(), w)
}

func (h *Handler) HTMXIndexList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	indexes, err := h.inspector.ListIndexes(r.Context())
	if err != nil {
		w.Write([]byte(`<div style="color: var(--red-400);">Failed to load indexes</div>`))
		return
	}

	out := make([]templates.IndexInfo, len(indexes))
	for i, idx := range indexes {
		out[i] = templates.IndexInfo{
			Name:      idx.Name,
			TableName: idx.TableName,
			Size:      idx.Size,
			IsPrimary: idx.IsPrimary,
			IsUnique:  idx.IsUnique,
		}
	}

	templates.IndexList(out, r.URL.Query().Get("current")).Render(r.Context(), w)
}
