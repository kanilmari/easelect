module easelect

go 1.23

toolchain go1.24.0

//	github.com/Knetic/govaluate v3.0.0+incompatible
require github.com/lib/pq v1.10.9

require (
	github.com/google/uuid v1.6.0
	github.com/gorilla/sessions v1.4.0
	github.com/joho/godotenv v1.5.1
	github.com/pgvector/pgvector-go v0.2.3
	github.com/sashabaranov/go-openai v1.36.1
	golang.org/x/crypto v0.31.0
)

require github.com/gorilla/securecookie v1.1.2 // indirect
