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
