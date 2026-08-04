#!/bin/bash
# Build the frontend Docker image with no cache

echo "Building Naksha Frontend Docker Image..."
echo "========================================="

docker build --no-cache -t naksha_frontend:latest .

echo ""
echo "Build complete!"
echo "To run: docker-compose -f docker-compose.standalone.yml up -d"
