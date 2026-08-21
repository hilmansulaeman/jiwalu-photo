package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"urbanmenphoto/backend/app/models"
)

func (s *Server) handleAdminProjects(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if r.Method == http.MethodGet {
		projects := s.store.ListProjects()
		writeJSON(w, http.StatusOK, response{Data: projects})
		return
	}

	if r.Method == http.MethodPost {
		var p models.Project
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		if p.ID == "" {
			p.ID = newID()
		}
		if p.Settings == nil {
			p.Settings = make(map[string]any)
		}

		if err := s.store.CreateProject(p); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, response{Data: p})
		return
	}

	writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
}

func (s *Server) handleAdminProjectByID(w http.ResponseWriter, r *http.Request) {
	_, err := s.requireAdmin(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/admin/projects/")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	if r.Method == http.MethodGet {
		p, found := s.store.GetProject(id)
		if !found {
			writeError(w, http.StatusNotFound, "Project not found")
			return
		}
		writeJSON(w, http.StatusOK, response{Data: p})
		return
	}

	if r.Method == http.MethodPatch || r.Method == http.MethodPut {
		var updates models.Project
		if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		p, found := s.store.GetProject(id)
		if !found {
			writeError(w, http.StatusNotFound, "Project not found")
			return
		}

		if updates.Name != "" {
			p.Name = updates.Name
		}
		if updates.Cover != "" {
			p.Cover = updates.Cover
		}
		if updates.Settings != nil {
			p.Settings = updates.Settings
		}

		if err := s.store.UpdateProject(p); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, response{Data: p})
		return
	}

	if r.Method == http.MethodDelete {
		if err := s.store.DeleteProject(id); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, response{Data: map[string]bool{"success": true}})
		return
	}

	writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
}

func (s *Server) handlePublicProjects(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	projects := s.store.ListProjects()
	// Optionally map to a lighter struct if you want to hide settings, but we can just return it.
	writeJSON(w, http.StatusOK, response{Data: projects})
}
