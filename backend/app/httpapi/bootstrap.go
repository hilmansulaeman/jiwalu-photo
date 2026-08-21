package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"urbanmenphoto/backend/app/auth"
	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/models"
	"urbanmenphoto/backend/app/store"
)

func EnsureBootstrapAdmin(cfg config.Config, appStore store.Store) error {
	email := strings.ToLower(strings.TrimSpace(cfg.BootstrapAdminEmail))
	password := cfg.BootstrapAdminPass
	if email == "" && password == "" {
		return nil
	}
	if email == "" || password == "" {
		return errors.New("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together")
	}

	now := time.Now().UTC()
	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	if existing, ok := appStore.FindAdminUserByEmail(email); ok {
		existing.PasswordHash = passwordHash
		existing.Role = "owner"
		existing.UpdatedAt = now
		return appStore.UpsertAdminUser(existing)
	}

	return appStore.UpsertAdminUser(models.AdminUser{
		ID:           randomID(),
		Email:        email,
		PasswordHash: passwordHash,
		Role:         "owner",
		CreatedAt:    now,
		UpdatedAt:    now,
	})
}

func randomID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return time.Now().UTC().Format("20060102150405")
	}

	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	return hex.EncodeToString(bytes[0:4]) + "-" +
		hex.EncodeToString(bytes[4:6]) + "-" +
		hex.EncodeToString(bytes[6:8]) + "-" +
		hex.EncodeToString(bytes[8:10]) + "-" +
		hex.EncodeToString(bytes[10:16])
}
