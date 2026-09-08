package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
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

	rows, err := conn.Query(ctx, "SELECT email, role, google_id FROM admin_users")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Query failed: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	fmt.Println("Admin Users:")
	for rows.Next() {
		var email, role string
		var googleID *string
		err := rows.Scan(&email, &role, &googleID)
		if err != nil {
			log.Fatal(err)
		}
		gAuth := "No"
		if googleID != nil {
			gAuth = "Yes"
		}
		fmt.Printf("- Email: %s (Role: %s, Google Auth: %s)\n", email, role, gAuth)
	}
}
