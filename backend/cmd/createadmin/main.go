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
	dbURL := "postgres://jiwalu:jiwalu_dev_password@localhost:5433/db_jiwalu?sslmode=disable"
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	email := "admin@gmail.com"
	password := "admin123456" // password must be at least 10 chars!
    // Wait, the HashPassword requires 10 characters! Let me use "admin123456"

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
