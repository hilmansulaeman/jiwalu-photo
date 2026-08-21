package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	godotenv.Load("backend/.env")
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	rows, err := db.Query("SELECT id, email, role FROM admin_users")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()
	fmt.Println("Admin Users:")
	for rows.Next() {
		var id, email, role string
		rows.Scan(&id, &email, &role)
		fmt.Printf("- Email: %s (Role: %s)\n", email, role)
	}
}
