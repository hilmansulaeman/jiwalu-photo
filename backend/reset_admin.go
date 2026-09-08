package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
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

	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	res, err := conn.Exec(ctx, "UPDATE admin_users SET password_hash = $1 WHERE email = 'admin@urbanmenphoto.com'", string(hash))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Rows updated: %d\n", res.RowsAffected())
}
