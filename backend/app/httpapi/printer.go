package httpapi

import (
	"net/http"
	"strings"
)

type printRequest struct {
	PrinterName string `json:"printerName"`
	ImageURL    string `json:"imageUrl"`
	Copies      int    `json:"copies"`
	PaperSize   string `json:"paperSize"`
	Orientation string `json:"orientation"`
}

func (s *Server) handlePrinters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	var printers any
	if err := s.hardwareAgentRequest(r.Context(), http.MethodGet, "/api/printers", nil, &printers); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: printers})
}

func (s *Server) handlePrints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	var body printRequest
	if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.PrinterName) == "" || strings.TrimSpace(body.ImageURL) == "" {
		writeError(w, http.StatusBadRequest, "printerName and imageUrl are required.")
		return
	}
	if body.Copies < 1 {
		body.Copies = 1
	}
	var job any
	if err := s.hardwareAgentRequest(r.Context(), http.MethodPost, "/api/prints", body, &job); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, response{Data: job})
}

func (s *Server) handlePrintByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/prints/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusNotFound, "Print job not found.")
		return
	}
	var job any
	if err := s.hardwareAgentRequest(r.Context(), http.MethodGet, "/api/prints/"+hardwareAgentPathSegment(id), nil, &job); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response{Data: job})
}
