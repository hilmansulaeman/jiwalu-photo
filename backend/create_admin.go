package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	dbURL := "postgres://jiwalu:jiwalu_dev_password@localhost:5433/db_jiwalu?sslmode=disable"
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	email := "admin@gmail.com"
	password := "admin123"

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	// First, try to generate a UUID from Postgres. If it doesn't work, we could generate one in Go.
	// But it's easier to just rely on gen_random_uuid() which is built-in to PG 13+.
	query := `
		INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at) 
		VALUES (gen_random_uuid(), $1, $2, 'owner', $3, $3)
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
		RETURNING id;
	`
	now := time.Now().UTC()
	var newID string
	err = conn.QueryRow(ctx, query, email, string(hash), now).Scan(&newID)
	if err != nil {
		log.Fatalf("Failed to insert admin: %v", err)
	}

	fmt.Printf("Successfully created/updated admin!\nID: %s\nEmail: %s\n", newID, email)
}
