package main

import (
	"flag"
	"log"
	"os"

	"github.com/boringsql/pg-storage-visualizer"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	connStr := flag.String("db", "", "PostgreSQL connection string (or use DATABASE_URL env)")
	flag.Parse()

	dbURL := *connStr
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}

	if err := pgstoviz.Run(pgstoviz.Config{
		Port:  *port,
		DBUrl: dbURL,
	}); err != nil {
		log.Fatal(err)
	}
}
