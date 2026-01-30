# Dockerfile

# syntax=docker/dockerfile:1

## Base image for the build stage
FROM golang:1.17 AS build

WORKDIR /app

# Copy go modules and install dependencies
COPY go.mod .
COPY go.sum .
RUN go mod download

# Copy the source code to the working directory
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/main.go


## Base image for the final stage
FROM alpine:latest

WORKDIR /app

# Copy the built binary from the build stage
COPY --from=build /app/main .

# Command to run the executable
ENTRYPOINT ["./main"]
