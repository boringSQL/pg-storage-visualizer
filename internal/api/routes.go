package api

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
)

func SetupRoutes(mux *http.ServeMux, h *Handler, webFS embed.FS) {
	mux.HandleFunc("GET /api/indexes", h.ListIndexes)
	mux.HandleFunc("GET /api/index/{name}/meta", h.GetIndexMeta)
	mux.HandleFunc("GET /api/index/{name}/stats", h.GetIndexStats)
	mux.HandleFunc("GET /api/index/{name}/page/{blockno}", h.GetPageDetail)
	mux.HandleFunc("GET /api/index/{name}/tree", h.GetTreeStructure)
	mux.HandleFunc("GET /api/index/{name}/bloat", h.GetBloatInfo)
	mux.HandleFunc("GET /api/index/{name}/density", h.GetPageDensityMap)
	mux.HandleFunc("GET /api/index/{name}/pages", h.GetAllPageStats)

	mux.HandleFunc("GET /api/tables", h.ListTables)
	mux.HandleFunc("GET /api/table/{name}", h.GetTableDetail)
	mux.HandleFunc("GET /api/table/{name}/stats", h.GetTableStats)
	mux.HandleFunc("GET /api/table/{name}/page/{blockno}", h.GetHeapPageDetail)
	mux.HandleFunc("GET /api/table/{name}/pages", h.GetHeapPageMap)
	mux.HandleFunc("GET /api/table/{name}/find", h.FindRow)
	mux.HandleFunc("GET /api/table/{name}/indexed-columns", h.GetIndexedColumns)
	mux.HandleFunc("POST /api/table/{name}/demo/update", h.DemoUpdate)
	mux.HandleFunc("GET /api/table/{name}/demo/row", h.DemoGetRow)

	mux.HandleFunc("GET /api/mvcc", h.GetMVCCInfo)

	mux.HandleFunc("GET /htmx/mvcc", h.HTMXMVCCInfo)
	mux.HandleFunc("GET /htmx/tables", h.HTMXTableList)
	mux.HandleFunc("GET /htmx/indexes", h.HTMXIndexList)

	spa := spaHandler(webFS)
	mux.HandleFunc("GET /index/{name}", spa)
	mux.HandleFunc("GET /table/{name}", spa)
	mux.Handle("GET /", http.FileServer(http.FS(webFS)))
}

func spaHandler(webFS embed.FS) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		b, err := fs.ReadFile(webFS, "index.html")
		if err != nil {
			http.Error(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(b)
	}
}

func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			return
		}
		defer func() {
			if err := recover(); err != nil {
				log.Printf("panic: %v", err)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(500)
				w.Write([]byte(`{"error":"internal server error"}`))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
