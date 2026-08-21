package httpapi

import (
	"encoding/json"
	"net/http"
)

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	projectId := r.URL.Query().Get("projectId")
	if projectId != "" {
		p, found := s.store.GetProject(projectId)
		if found {
			writeJSON(w, http.StatusOK, response{Data: p.Settings})
			return
		}
	}

	settings := s.store.GetDeviceSettings()
	writeJSON(w, http.StatusOK, response{Data: settings})
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var newSettings map[string]any
	if err := json.NewDecoder(r.Body).Decode(&newSettings); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	projectId := r.URL.Query().Get("projectId")
	if projectId != "" {
		p, found := s.store.GetProject(projectId)
		if found {
			p.Settings = newSettings
			if err := s.store.UpdateProject(p); err != nil {
				writeError(w, http.StatusInternalServerError, "Failed to save project settings: "+err.Error())
				return
			}
			writeJSON(w, http.StatusOK, response{Data: newSettings})
			return
		}
	}

	if err := s.store.UpdateDeviceSettings(newSettings); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save settings: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response{Data: newSettings})
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleGetSettings(w, r)
	case http.MethodPost:
		s.handleUpdateSettings(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
