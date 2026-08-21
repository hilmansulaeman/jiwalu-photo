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
	dbURL := "postgres://jiwalu:jiwalu_dev_password@localhost:5433/db_jiwalu?sslmode=disable"
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	var hash string
	err = conn.QueryRow(ctx, "SELECT password_hash FROM admin_users WHERE email = 'admin@gmail.com'").Scan(&hash)
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	fmt.Printf("Hash from DB: %s\n", hash)
	
	err = bcrypt.CompareHashAndPassword([]byte(hash), []byte("admin123"))
	if err != nil {
		fmt.Printf("Bcrypt mismatch: %v\n", err)
	} else {
		fmt.Println("Bcrypt matches!")
	}
}
