#!/bin/bash

# start_fastapi.sh
# Script to start the FastAPI server

echo "Starting Omics Analysis Dashboard FastAPI server..."

# Check if Python virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start FastAPI server
echo "Starting FastAPI server on http://localhost:8000 with auto-reload"
# Using uvicorn command with import string for proper reload functionality
uvicorn fastapi_main:app --host 0.0.0.0 --port 8000 --reload

# Alternative: Run directly with Python (also has reload enabled)
# python fastapi_main.py
