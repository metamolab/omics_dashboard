@echo off
REM start_fastapi.bat
REM Script to start the FastAPI server on Windows

echo Starting Omics Analysis Dashboard FastAPI server...

REM Check if Python virtual environment exists
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Start FastAPI server
echo Starting FastAPI server on http://localhost:8000 with auto-reload
echo R script diagnostics will appear in this console...
echo.
echo TIP: For more detailed R script debugging, use start_fastapi_debug.bat
echo.
REM Using uvicorn command with import string for proper reload functionality
REM --log-level debug shows more detailed output including subprocess calls
REM Force Python unbuffered output and redirect stderr to stdout for visibility
set PYTHONUNBUFFERED=1
uvicorn fastapi_main:app --host 0.0.0.0 --port 8000 --reload --log-level info 2>&1

REM Alternative: Run directly with Python (also has reload enabled)
REM python fastapi_main.py

pause
