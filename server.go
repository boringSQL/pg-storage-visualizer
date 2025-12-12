package pgstoviz

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/boringsql/pg-storage-visualizer/internal/api"
	"github.com/boringsql/pg-storage-visualizer/internal/db"
	"github.com/boringsql/pg-storage-visualizer/internal/inspector"
	"github.com/boringsql/pg-storage-visualizer/web"
)

type Config struct {
	Port   int
	DBUrl  string
}

func DefaultConfig() Config {
	return Config{
		Port:  8080,
		DBUrl: "postgres://localhost:5432/postgres?sslmode=disable",
	}
}

func Run(cfg Config) error {
	if cfg.DBUrl == "" {
		cfg.DBUrl = os.Getenv("DATABASE_URL")
	}
	if cfg.DBUrl == "" {
		cfg.DBUrl = DefaultConfig().DBUrl
	}
	if cfg.Port == 0 {
		cfg.Port = 8080
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Printf("connecting to PostgreSQL...")
	database, err := db.New(ctx, cfg.DBUrl)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer database.Close()

	if err := database.EnsureExtensions(ctx); err != nil {
		return fmt.Errorf("extensions: %w", err)
	}
	log.Printf("extensions available (pageinspect, pgstattuple)")

	insp := inspector.New(database.Pool(), database.Queries)
	handler := api.NewHandler(insp)

	mux := http.NewServeMux()
	api.SetupRoutes(mux, handler, web.FS)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      api.CORSMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Printf("server running on http://localhost:%d", cfg.Port)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	return server.Shutdown(shutdownCtx)
}
