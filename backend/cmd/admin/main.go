package main

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"syscall"
	"time"

	"golang.org/x/term"

	"urbanmenphoto/backend/app/auth"
	"urbanmenphoto/backend/app/config"
	"urbanmenphoto/backend/app/models"
	"urbanmenphoto/backend/app/store"
)

func main() {
	email := flag.String("email", "", "admin email")
	role := flag.String("role", "owner", "admin role: owner or staff")
	passwordArg := flag.String("password", "", "admin password; omit to prompt")
	force := flag.Bool("force", false, "update password/role if email already exists")
	flag.Parse()

	normalizedEmail := strings.ToLower(strings.TrimSpace(*email))
	if normalizedEmail == "" {
		normalizedEmail = promptLine("Email: ")
	}
	if normalizedEmail == "" || !strings.Contains(normalizedEmail, "@") {
		log.Fatal("valid email is required")
	}
	if *role != "owner" && *role != "staff" {
		log.Fatal("role must be owner or staff")
	}

	password := *passwordArg
	if password == "" {
		password = promptPassword("Password: ")
		confirm := promptPassword("Confirm password: ")
		if password != confirm {
			log.Fatal("password confirmation does not match")
		}
	}

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatal(err)
	}

	cfg := config.Load()
	appStore, err := openStore(cfg)
	if err != nil {
		log.Fatalf("init store: %v", err)
	}

	if existing, exists := appStore.FindAdminUserByEmail(normalizedEmail); exists {
		if !*force {
			log.Fatalf("admin %s already exists; use -force to update", normalizedEmail)
		}
		existing.PasswordHash = passwordHash
		existing.Role = *role
		existing.UpdatedAt = time.Now()
		if err := appStore.UpsertAdminUser(existing); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Updated admin %s (%s)\n", normalizedEmail, *role)
		return
	}

	now := time.Now()
	user := models.AdminUser{
		ID:           "admin-" + shortID(),
		Email:        normalizedEmail,
		PasswordHash: passwordHash,
		Role:         *role,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := appStore.UpsertAdminUser(user); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Created admin %s (%s)\n", normalizedEmail, *role)
}

func openStore(cfg config.Config) (store.Store, error) {
	if cfg.DatabaseURL != "" {
		return store.NewPostgresStore(cfg.DatabaseURL)
	}
	return store.NewJSONStore(cfg.DataDir)
}

func promptLine(label string) string {
	fmt.Print(label)
	reader := bufio.NewReader(os.Stdin)
	value, _ := reader.ReadString('\n')
	return strings.TrimSpace(value)
}

func promptPassword(label string) string {
	fmt.Print(label)
	value, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		log.Fatal(err)
	}
	return string(value)
}

func shortID() string {
	now := time.Now().UnixNano()
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	if now == 0 {
		return "0"
	}
	out := []byte{}
	for now > 0 {
		out = append([]byte{alphabet[now%int64(len(alphabet))]}, out...)
		now /= int64(len(alphabet))
	}
	return string(out)
}
