package httpapi

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"
	"urbanmenphoto/backend/app/auth"
	"urbanmenphoto/backend/app/models"
)

var googleOauthConfig = &oauth2.Config{
	RedirectURL:  "http://localhost:8787/api/auth/google/callback",
	ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
	ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
	Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
	Endpoint:     google.Endpoint,
}

func generateStateOauthCookie(w http.ResponseWriter) string {
	var expiration = time.Now().Add(20 * time.Minute)
	b := make([]byte, 16)
	rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	cookie := http.Cookie{
		Name:     "oauthstate",
		Value:    state,
		Expires:  expiration,
		HttpOnly: true,
		Path:     "/",
	}
	http.SetCookie(w, &cookie)
	return state
}

func (s *Server) handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	if googleOauthConfig.ClientID == "" {
		http.Error(w, "Google Client ID not configured", http.StatusInternalServerError)
		return
	}
	
	oauthState := generateStateOauthCookie(w)
	u := googleOauthConfig.AuthCodeURL(oauthState)
	http.Redirect(w, r, u, http.StatusTemporaryRedirect)
}

func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	oauthState, err := r.Cookie("oauthstate")
	if err != nil || r.FormValue("state") != oauthState.Value {
		writeError(w, http.StatusBadRequest, "Invalid OAuth state")
		return
	}

	code := r.FormValue("code")
	token, err := googleOauthConfig.Exchange(r.Context(), code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to exchange token")
		return
	}

	response, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + token.AccessToken)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get user info")
		return
	}
	defer response.Body.Close()

	var googleUser struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(response.Body).Decode(&googleUser); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to parse user info")
		return
	}
	
	if googleUser.Email == "" {
		writeError(w, http.StatusBadRequest, "No email returned from Google")
		return
	}

	var loggedInUser *models.AdminUser
	tokenHash, err := adminTokenHashFromRequest(r)
	if err == nil {
		if tokenData, ok := s.store.FindAdminTokenByHash(tokenHash); ok {
			if time.Now().Before(tokenData.ExpiresAt) {
				if usr, ok := s.store.FindAdminUserByID(tokenData.UserID); ok {
					loggedInUser = &usr
				}
			}
		}
	}

	var user models.AdminUser
	if loggedInUser != nil {
		user = *loggedInUser
		user.GoogleID = &googleUser.ID
		user.AvatarURL = &googleUser.Picture
		user.UpdatedAt = time.Now()
		
		if err := s.store.UpsertAdminUser(user); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to link Google account")
			return
		}
		
		s.store.InsertAuditLog(models.AuditLog{
			ID:        newID(),
			ActorID:   &user.ID,
			Action:    "auth.google_link",
			Resource:  "admin_users:" + user.ID,
			Metadata:  map[string]any{"email": googleUser.Email},
			IP:        r.RemoteAddr,
			UserAgent: r.UserAgent(),
			Success:   true,
			CreatedAt: time.Now(),
		})
		
		adminTokenStr := ""
		if cookie, err := r.Cookie("admin_token"); err == nil {
			adminTokenStr = cookie.Value
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		html := fmt.Sprintf(`
			<html><body><script>
				const data = {
					token: "%s",
					user: {
						id: "%s", email: "%s", role: "%s", googleId: "%s", avatarUrl: "%s"
					}
				};
				if (window.opener) {
					window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', payload: data }, "*");
					window.close();
				} else {
					localStorage.setItem("urbanmenphoto_admin_user", JSON.stringify(data.user));
					window.location.href = "/admin?tab=profile";
				}
			</script></body></html>
		`, adminTokenStr, user.ID, user.Email, user.Role, *user.GoogleID, *user.AvatarURL)
		w.Write([]byte(html))
		return
	}

	user, exists := s.store.FindAdminUserByEmail(googleUser.Email)
	if !exists {
		user = models.AdminUser{
			ID:        newID(),
			Email:     googleUser.Email,
			Role:      "staff",
			GoogleID:  &googleUser.ID,
			AvatarURL: &googleUser.Picture,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	} else {
		user.GoogleID = &googleUser.ID
		user.AvatarURL = &googleUser.Picture
		user.UpdatedAt = time.Now()
	}

	if err := s.store.UpsertAdminUser(user); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to upsert admin user")
		return
	}

	tokenStr := newID() + "." + shortCode()

	adminTokenData := models.AdminToken{
		TokenHash: auth.HashToken(tokenStr),
		UserID:    user.ID,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Duration(s.cfg.AdminTokenTTLHrs) * time.Hour),
	}

	if err := s.store.InsertAdminToken(adminTokenData); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save token")
		return
	}
	
	http.SetCookie(w, &http.Cookie{
		Name:     "admin_token",
		Value:    tokenStr,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, 
		SameSite: http.SameSiteLaxMode,
		Expires:  adminTokenData.ExpiresAt,
	})

	s.store.InsertAuditLog(models.AuditLog{
		ID:        newID(),
		ActorID:   &user.ID,
		Action:    "auth.google_login",
		Resource:  "admin_users:" + user.ID,
		Metadata:  map[string]any{"email": user.Email},
		IP:        r.RemoteAddr,
		UserAgent: r.UserAgent(),
		Success:   true,
		CreatedAt: time.Now(),
	})

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	html := fmt.Sprintf(`
		<html><body><script>
			const data = {
				token: "%s",
				user: {
					id: "%s", email: "%s", role: "%s", googleId: "%s", avatarUrl: "%s"
				}
			};
			if (window.opener) {
				window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', payload: data }, "*");
				window.close();
			} else {
				localStorage.setItem("urbanmenphoto_admin_token", data.token);
				localStorage.setItem("urbanmenphoto_admin_user", JSON.stringify(data.user));
				window.location.href = "/admin?tab=profile";
			}
		</script></body></html>
	`, tokenStr, user.ID, user.Email, user.Role, *user.GoogleID, *user.AvatarURL)
	w.Write([]byte(html))
}

type GoogleVerifyRequest struct {
	Credential string `json:"credential"`
}

func (s *Server) handleGoogleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req GoogleVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.Credential == "" {
		writeError(w, http.StatusBadRequest, "Credential missing")
		return
	}

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	payload, err := idtoken.Validate(r.Context(), req.Credential, clientID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid token")
		return
	}

	email, ok := payload.Claims["email"].(string)
	if !ok || email == "" {
		writeError(w, http.StatusBadRequest, "Email missing in token")
		return
	}
	
	googleID := payload.Subject
	picture, _ := payload.Claims["picture"].(string)

	var loggedInUser *models.AdminUser
	tokenHash, err := adminTokenHashFromRequest(r)
	if err == nil {
		if tokenData, ok := s.store.FindAdminTokenByHash(tokenHash); ok {
			if time.Now().Before(tokenData.ExpiresAt) {
				if usr, ok := s.store.FindAdminUserByID(tokenData.UserID); ok {
					loggedInUser = &usr
				}
			}
		}
	}

	var user models.AdminUser
	if loggedInUser != nil {
		user = *loggedInUser
		user.GoogleID = &googleID
		user.AvatarURL = &picture
		user.UpdatedAt = time.Now()
		
		if err := s.store.UpsertAdminUser(user); err != nil {
			writeError(w, http.StatusInternalServerError, "Failed to link Google account")
			return
		}
		
		s.store.InsertAuditLog(models.AuditLog{
			ID:        newID(),
			ActorID:   &user.ID,
			Action:    "auth.google_link",
			Resource:  "admin_users:" + user.ID,
			Metadata:  map[string]any{"email": email},
			IP:        r.RemoteAddr,
			UserAgent: r.UserAgent(),
			Success:   true,
			CreatedAt: time.Now(),
		})
		
		writeJSON(w, http.StatusOK, response{Data: map[string]any{
			"user": map[string]any{
				"id":        user.ID,
				"email":     user.Email,
				"role":      user.Role,
				"googleId":  user.GoogleID,
				"avatarUrl": user.AvatarURL,
			},
		}})
		return
	}

	user, exists := s.store.FindAdminUserByEmail(email)
	if !exists {
		user = models.AdminUser{
			ID:        newID(),
			Email:     email,
			Role:      "staff",
			GoogleID:  &googleID,
			AvatarURL: &picture,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	} else {
		user.GoogleID = &googleID
		user.AvatarURL = &picture
		user.UpdatedAt = time.Now()
	}

	if err := s.store.UpsertAdminUser(user); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to upsert admin user")
		return
	}

	tokenStr := newID() + "." + shortCode()

	adminTokenData := models.AdminToken{
		TokenHash: auth.HashToken(tokenStr),
		UserID:    user.ID,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(time.Duration(s.cfg.AdminTokenTTLHrs) * time.Hour),
	}

	if err := s.store.InsertAdminToken(adminTokenData); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save token")
		return
	}
	
	s.store.InsertAuditLog(models.AuditLog{
		ID:        newID(),
		ActorID:   &user.ID,
		Action:    "auth.google_login",
		Resource:  "admin_users:" + user.ID,
		Metadata:  map[string]any{"email": user.Email},
		IP:        r.RemoteAddr,
		UserAgent: r.UserAgent(),
		Success:   true,
		CreatedAt: time.Now(),
	})

	writeJSON(w, http.StatusOK, response{Data: map[string]any{
		"token": tokenStr,
		"user": map[string]any{
			"id":        user.ID,
			"email":     user.Email,
			"role":      user.Role,
			"googleId":  user.GoogleID,
			"avatarUrl": user.AvatarURL,
		},
	}})
}
