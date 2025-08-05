# Omics Analysis Dashboard - FastAPI Backend

This project now uses FastAPI as the backend server instead of a traditional Node.js API. The FastAPI backend integrates with R scripts to perform omics data analysis.

## Setup Instructions

### Prerequisites

1. **Python 3.8+** - Required for FastAPI
2. **R 4.0+** - Required for data analysis scripts
3. **Node.js 18+** - Required for Angular frontend

### Required R Packages

Install the following R packages:

```r
install.packages(c(
  "jsonlite",
  "readr", 
  "dplyr",
  "glmnet",
  "randomForest",
  "Boruta",
  "caret"
))
```

### Backend Setup (FastAPI)

1. **Navigate to the project directory:**
   ```bash
   cd data-analysis-dashboard
   ```

2. **Create and activate Python virtual environment:**
   
   On Windows:
   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```
   
   On macOS/Linux:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the FastAPI server:**
   
   Manual start:
   ```bash
   python fastapi_main.py
   ```
   
   Or use the provided scripts:
   - Windows: `start_fastapi.bat`
   - macOS/Linux: `./start_fastapi.sh`

The FastAPI server will start on `http://localhost:8000`

### Frontend Setup (Angular)

1. **Install Angular dependencies:**
   ```bash
   npm install
   ```

2. **Start the Angular development server:**
   ```bash
   npm start
   ```

The Angular frontend will be available at `http://localhost:4200`

## API Endpoints

The FastAPI backend provides the following endpoints:

- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint
- `GET /test_r` - Test R integration
- `POST /preprocess` - File preprocessing
- `POST /analyze` - Submit analysis request
- `GET /status/{analysis_id}` - Get analysis status
- `GET /results/{analysis_id}` - Get analysis results

## File Structure

```
├── fastapi_main.py           # Main FastAPI application
├── requirements.txt          # Python dependencies
├── start_fastapi.bat         # Windows startup script
├── start_fastapi.sh          # Unix startup script
├── test_fastapi.R           # R test script
├── preprocess.R             # Data preprocessing R script
├── analysis.R               # Main analysis R script
├── src/
│   └── app/
│       └── services/
│           └── api.service.ts # Updated Angular API service
└── proxy.conf.json          # Angular proxy configuration
```

## Key Changes

### Angular API Service

The `api.service.ts` has been updated to:
- Use FastAPI endpoint URL (`http://localhost:8000`)
- Include all required form data fields in `submitAnalysis()`
- Transform `customSubsetSizes` from string to number array
- Handle CORS properly with FastAPI

### FastAPI Backend

The `fastapi_main.py` provides:
- CORS middleware for Angular frontend
- File upload handling with multipart forms
- Background task processing for long-running analyses
- R script integration with proper error handling
- Analysis status tracking and result storage

### R Scripts

- `test_fastapi.R` - Simple test script for verifying R integration
- `preprocess.R` - Handles data preprocessing with various options
- `analysis.R` - Performs statistical and multivariate analyses

## Data Flow

1. **File Upload & Preprocessing:**
   - User uploads file via Angular frontend
   - Frontend sends file + options to `/preprocess` endpoint
   - FastAPI calls `preprocess.R` script
   - Processed file is returned to frontend

2. **Analysis Submission:**
   - User configures analysis options and submits
   - Frontend sends all data to `/analyze` endpoint
   - FastAPI starts background task calling `analysis.R`
   - Analysis ID is returned immediately

3. **Result Polling:**
   - Frontend polls `/status/{analysis_id}` for progress
   - When complete, frontend fetches results from `/results/{analysis_id}`

## Troubleshooting

### Common Issues

1. **R packages not found:**
   - Ensure all required R packages are installed
   - Check R is in system PATH

2. **FastAPI server won't start:**
   - Check Python virtual environment is activated
   - Verify all dependencies in `requirements.txt` are installed
   - Ensure port 8000 is available

3. **CORS errors:**
   - The FastAPI server includes CORS middleware for `http://localhost:4200`
   - If using a different port, update the CORS origins in `fastapi_main.py`

4. **File upload errors:**
   - Check temporary directory permissions
   - Verify file size limits
   - Ensure proper file format (CSV, TSV, TXT)

### Development Tips

- FastAPI provides automatic API documentation at `http://localhost:8000/docs`
- Use the `/test_r` endpoint to verify R integration
- Check server logs for detailed error messages
- Monitor the `/health` endpoint for server status

## Production Deployment

For production deployment:

1. Use a production WSGI server like Gunicorn:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -k uvicorn.workers.UvicornWorker fastapi_main:app
   ```

2. Configure proper CORS origins for your domain
3. Set up proper file storage and cleanup mechanisms
4. Configure logging and monitoring
5. Use environment variables for configuration
