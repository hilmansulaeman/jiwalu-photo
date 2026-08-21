package handler

import (
	"log"
	"net/http"
	"sync"

	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/httpapi"
	"urbanmenphoto/backend/app/store"
)

var (
	handlerOnce sync.Once
	handler     http.Handler
	handlerErr  error
)

func Handler(w http.ResponseWriter, r *http.Request) {
	handlerOnce.Do(func() {
		cfg := config.Load()
		var appStore store.Store
		if cfg.DatabaseURL != "" {
			appStore, handlerErr = store.NewPostgresStore(cfg.DatabaseURL)
		} else {
			appStore, handlerErr = store.NewJSONStore(cfg.DataDir)
		}
		if handlerErr != nil {
			return
		}
		if handlerErr = httpapi.EnsureBootstrapAdmin(cfg, appStore); handlerErr != nil {
			return
		}
		server := httpapi.NewServer(cfg, appStore)
		server.StartCleanupWorker()
		handler = server.Routes()
		log.Printf("Urbanmenphoto public backend ready at %s", cfg.PublicBaseURL)
	})

	if handlerErr != nil {
		http.Error(w, "init backend: "+handlerErr.Error(), http.StatusInternalServerError)
		return
	}
	handler.ServeHTTP(w, r)
}
