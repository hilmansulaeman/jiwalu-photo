package main

import (
	"log"
	"net/http"

	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/httpapi"
	"urbanmenphoto/backend/app/store"
)

func main() {
	cfg := config.Load()
	var appStore store.Store
	var err error
	if cfg.DatabaseURL != "" {
		appStore, err = store.NewPostgresStore(cfg.DatabaseURL)
	} else {
		appStore, err = store.NewJSONStore(cfg.DataDir)
	}
	if err != nil {
		log.Fatalf("init store: %v", err)
	}
	if err := httpapi.EnsureBootstrapAdmin(cfg, appStore); err != nil {
		log.Fatalf("bootstrap admin: %v", err)
	}

	server := httpapi.NewServer(cfg, appStore)
	server.StartCleanupWorker()
	addr := cfg.Host + ":" + cfg.Port

	log.Printf("Urbanmenphoto Go backend running at %s", cfg.PublicBaseURL)
	if err := http.ListenAndServe(addr, server.Routes()); err != nil {
		log.Fatal(err)
	}
}
