package web

import "embed"

//go:embed index.html styles.css app.js logo.png
var FS embed.FS
