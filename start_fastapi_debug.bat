@echo off
REM start_fastapi_debug.bat
REM Script to start the FastAPI server on Windows with maximum R script visibility

echo Starting Omics Analysis Dashboard FastAPI server in DEBUG mode...
echo This will show ALL R script output and diagnostics in the console.
echo.

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

echo.
echo ================================================
echo  FastAPI Server Starting with R Script Debug
echo ================================================
echo.

REM Start FastAPI server with debug logging and force console output
REM Create temporary Python script for better debugging
echo import sys > temp_debug_server.py
echo import os >> temp_debug_server.py
echo sys.path.append('.') >> temp_debug_server.py
echo os.environ['PYTHONUNBUFFERED'] = '1' >> temp_debug_server.py
echo os.environ['PYTHONIOENCODING'] = 'utf-8' >> temp_debug_server.py
echo import uvicorn >> temp_debug_server.py
echo uvicorn.run('fastapi_main:app', host='0.0.0.0', port=8000, reload=True, log_level='debug') >> temp_debug_server.py

echo Starting FastAPI with maximum R script visibility...
python -u temp_debug_server.py 2>&1

REM Clean up temporary file
del temp_debug_server.py

pause
