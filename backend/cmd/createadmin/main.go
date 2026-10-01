package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"urbanmenphoto/backend/app/auth"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		os.Exit(1)
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	email := os.Getenv("ADMIN_EMAIL")
	password := os.Getenv("ADMIN_PASSWORD")
	if email == "" || password == "" {
		fmt.Fprintln(os.Stderr, "ADMIN_EMAIL and ADMIN_PASSWORD must be set")
		os.Exit(1)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatal(err)
	}

	query := `
		INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at) 
		VALUES (gen_random_uuid(), $1, $2, 'owner', $3, $3)
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
		RETURNING id;
	`
	now := time.Now().UTC()
	var newID string
	err = conn.QueryRow(ctx, query, email, hash, now).Scan(&newID)
	if err != nil {
		log.Fatalf("Failed to insert admin: %v", err)
	}

	fmt.Printf("Successfully created/updated admin!\nID: %s\nEmail: %s\n", newID, email)
}
