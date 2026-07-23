package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

//go:embed schema.sql
var schemaSQL string

//go:embed 002_phase2_tables.sql
var phase2SQL string

//go:embed 003_phase3_tables.sql
var phase3SQL string

//go:embed 004_policy_versions.sql
var phase4SQL string

var DB *sql.DB

// InitDB initializes connection to PostgreSQL and runs schema migration
func InitDB() (*sql.DB, error) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "postgres")
		password := getEnv("DB_PASSWORD", "postgres")
		dbname := getEnv("DB_NAME", "mdm_db")
		sslmode := getEnv("DB_SSLMODE", "disable")

		connStr = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, dbname, sslmode)
	}

	var db *sql.DB
	var err error

	// Retry database connection if PostgreSQL container is still starting
	for i := 0; i < 5; i++ {
		db, err = sql.Open("postgres", connStr)
		if err == nil {
			err = db.Ping()
			if err == nil {
				break
			}
		}
		log.Printf("Waiting for database connection... Attempt %d/5: %v", i+1, err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	log.Println("Database connection established. Applying schema migrations...")

	if _, err := db.Exec(schemaSQL); err != nil {
		return nil, fmt.Errorf("failed to run phase 1 schema migrations: %w", err)
	}

	if _, err := db.Exec(phase2SQL); err != nil {
		return nil, fmt.Errorf("failed to run phase 2 schema migrations: %w", err)
	}

	if _, err := db.Exec(phase3SQL); err != nil {
		return nil, fmt.Errorf("failed to run phase 3 schema migrations: %w", err)
	}

	if _, err := db.Exec(phase4SQL); err != nil {
		return nil, fmt.Errorf("failed to run phase 4 schema migrations: %w", err)
	}

	log.Println("All schema migrations applied successfully.")
	DB = db
	return db, nil
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}
