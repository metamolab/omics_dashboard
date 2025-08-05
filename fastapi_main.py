from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import subprocess
import json
import os
import uuid
import tempfile
import shutil
import sys
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import asyncio
import aiofiles

# Configure logging to show R script output in console
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Omics Analysis Dashboard API",
    description="FastAPI backend for omics data analysis with R scripts",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],  # Angular dev port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global storage (temporaneo?)
analysis_storage: Dict[str, Dict[str, Any]] = {}

# modelli Pydantic per check dell'input
class AnalysisStatus(BaseModel):
    status: str

class AnalysisResult(BaseModel):
    id: str
    status: str
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: datetime

class PreprocessingResult(BaseModel):
    success: bool
    message: str
    processed_file_path: Optional[str] = None

# Utility functions (create da lui)
def create_temp_directory() -> str:
    """Create a temporary directory for file processing"""
    return tempfile.mkdtemp()

def create_user_session_directory(user_id: str, session_id: str) -> str:
    """Create a persistent directory for user session data"""
    # Create directory name combining userId and sessionId
    dir_name = f"{user_id}_{session_id}"
    
    # Create the full path in the project directory
    project_dir = os.path.dirname(os.path.abspath(__file__))
    session_dir = os.path.join(project_dir, "user_sessions", dir_name)
    
    # Create directory if it doesn't exist
    os.makedirs(session_dir, exist_ok=True)
    
    return session_dir

def cleanup_temp_directory(temp_dir: str):
    """Clean up temporary directory"""
    try:
        shutil.rmtree(temp_dir)
    except Exception as e:
        print(f"Warning: Failed to cleanup temp directory {temp_dir}: {e}")

def save_session_options(session_dir: str, preprocessing_options: dict, analysis_options: dict = None):
    """Save session options to files for future reference"""
    try:
        # Save preprocessing options
        preprocessing_file = os.path.join(session_dir, "preprocessing_options.json")
        with open(preprocessing_file, 'w') as f:
            json.dump(preprocessing_options, f, indent=2)
        
        # Save analysis options if provided
        if analysis_options:
            analysis_file = os.path.join(session_dir, "analysis_options.json")
            with open(analysis_file, 'w') as f:
                json.dump(analysis_options, f, indent=2)
                
    except Exception as e:
        print(f"Warning: Failed to save session options: {e}")

async def run_r_script(script_name: str, args: Dict[str, Any], timeout: int = 300) -> Dict[str, Any]:
    """Run R script with given arguments and return parsed JSON result"""
    try:
        
        args_json = json.dumps(args)
        
        # Run R script (in maniera asincrona? giusto fare così per la dashboard?)
        result = await asyncio.create_subprocess_exec(
            "Rscript", script_name, args_json,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await asyncio.wait_for(result.communicate(), timeout=timeout)
        
        # Print R script diagnostics to console for debugging
        if stderr:
            stderr_text = stderr.decode()
            print(f"\n=== R SCRIPT DIAGNOSTICS ({script_name}) ===", flush=True)
            print(stderr_text, flush=True)
            print("=== END R SCRIPT DIAGNOSTICS ===\n", flush=True)
            
            # Also log using logger for better visibility
            logger.info(f"R Script {script_name} diagnostics:\n{stderr_text}")
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=500, 
                detail=f"R script execution failed: {stderr.decode()}"
            )
        
        try:
            return json.loads(stdout.decode())
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse R script output as JSON: {stdout.decode()}"
            )
    
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408,
            detail=f"R script execution timed out after {timeout} seconds"
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Rscript not found. Ensure R is installed and in PATH"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error running R script: {str(e)}"
        )

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "Omics Analysis Dashboard API",
        "version": "1.0.0",
        "status": "running"
    }

@app.post("/preprocess")
async def preprocess_file(
    file: UploadFile = File(...),
    options: str = Form(...),
    userId: str = Form(...),
    sessionId: str = Form(...)
):
    """Preprocess file e opzioni caricate"""
    
    # Parse preprocessing options
    try:
        preprocessing_options = json.loads(options)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid preprocessing options JSON")
    
    # Create persistent user session directory
    session_dir = create_user_session_directory(userId, sessionId)
    
    try:
        # Save uploaded file with original name
        input_file_path = os.path.join(session_dir, f"original_{file.filename}")
        async with aiofiles.open(input_file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Save preprocessing options for future reference
        save_session_options(session_dir, preprocessing_options)
        
        # Prepare arguments for R preprocessing script
        r_args = {
            "input_file": input_file_path,
            "output_dir": session_dir,  # Use persistent directory instead of temp
            "options": preprocessing_options
        }
        
        # Run R preprocessing script
        result = await run_r_script("preprocess.R", r_args)
        
        # Check if preprocessing was successful
        if not result.get("success", False):
            raise HTTPException(
                status_code=500,
                detail=f"Preprocessing failed: {result.get('message', 'Unknown error')}"
            )
        
        # Return processed file
        processed_file_path = result.get("processed_file_path")
        if processed_file_path and os.path.exists(processed_file_path):
            return FileResponse(
                processed_file_path,
                media_type='application/octet-stream',
                filename=f"processed_{file.filename}"
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Processed file not found"
            )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze", response_model=AnalysisResult)
async def submit_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sessionId: str = Form(...),
    userId: str = Form(...),
    preprocessingOptions: str = Form(...),
    analysisOptions: str = Form(...)
):
    """Submit analysis request and return analysis ID"""
    
    # Parse options
    try:
        preprocessing_opts = json.loads(preprocessingOptions)
        analysis_opts = json.loads(analysisOptions)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid options JSON")
    
    # Create analysis ID
    analysis_id = f"{userId}_{sessionId}"
    
    # Initialize analysis storage
    analysis_storage[analysis_id] = {
        "id": analysis_id,
        "status": "pending",
        "results": None,
        "error": None,
        "timestamp": datetime.now()
    }
    
    # Start background analysis
    background_tasks.add_task(
        perform_analysis,
        analysis_id,
        file,
        preprocessing_opts,
        analysis_opts
    )
    
    return AnalysisResult(
        id=analysis_id,
        status="pending",
        timestamp=datetime.now()
    )

async def perform_analysis(
    analysis_id: str,
    file: UploadFile,
    preprocessing_options: Dict[str, Any],
    analysis_options: Dict[str, Any]
):
    """Perform the actual analysis in background"""
    
    # Extract userId and sessionId from analysis_id
    user_id, session_id = analysis_id.split('_', 1)
    
    # Use persistent user session directory
    session_dir = create_user_session_directory(user_id, session_id)
    
    try:
        # Update status to running
        analysis_storage[analysis_id]["status"] = "running"
        
        # Save uploaded file if it's different from preprocessing
        input_file_path = os.path.join(session_dir, f"analysis_{file.filename}")
        async with aiofiles.open(input_file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Save analysis options for future reference
        save_session_options(session_dir, preprocessing_options, analysis_options)
        
        # Prepare arguments for R analysis script
        r_args = {
            "input_file": input_file_path,
            "output_dir": session_dir,  # Use persistent directory
            "preprocessing_options": preprocessing_options,
            "analysis_options": analysis_options,
            "analysis_id": analysis_id
        }
        
        # Run R analysis script
        result = await run_r_script("analysis.R", r_args, timeout=600)  # 10 minutes timeout
        
        # Save analysis results to file for persistence
        results_file = os.path.join(session_dir, "analysis_results.json")
        with open(results_file, 'w') as f:
            json.dump(result, f, indent=2, default=str)
        
        # Update analysis storage with results
        analysis_storage[analysis_id].update({
            "status": "completed",
            "results": result,
            "session_dir": session_dir,
            "timestamp": datetime.now()
        })
    
    except Exception as e:
        # Update analysis storage with error
        analysis_storage[analysis_id].update({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now()
        })

@app.get("/status/{analysis_id}")
def get_analysis_status(analysis_id: str):
    """Get analysis status"""
    
    if analysis_id not in analysis_storage:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return analysis_storage[analysis_id]["status"]

@app.get("/results/{analysis_id}", response_model=AnalysisResult)
def get_analysis_results(analysis_id: str):
    """Get analysis results"""
    
    if analysis_id not in analysis_storage:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    analysis_data = analysis_storage[analysis_id]
    
    return AnalysisResult(
        id=analysis_data["id"],
        status=analysis_data["status"],
        results=analysis_data.get("results"),
        error=analysis_data.get("error"),
        timestamp=analysis_data["timestamp"]
    )

@app.get("/session/{user_id}/{session_id}")
def get_session_info(user_id: str, session_id: str):
    """Get session information and file list"""
    
    session_dir = create_user_session_directory(user_id, session_id)
    
    if not os.path.exists(session_dir):
        raise HTTPException(status_code=404, detail="Session not found")
    
    # List files in session directory
    files = []
    for filename in os.listdir(session_dir):
        file_path = os.path.join(session_dir, filename)
        if os.path.isfile(file_path):
            files.append({
                "filename": filename,
                "size": os.path.getsize(file_path),
                "modified": datetime.fromtimestamp(os.path.getmtime(file_path))
            })
    
    # Load options if they exist
    preprocessing_options = None
    analysis_options = None
    
    preprocessing_file = os.path.join(session_dir, "preprocessing_options.json")
    if os.path.exists(preprocessing_file):
        with open(preprocessing_file, 'r') as f:
            preprocessing_options = json.load(f)
    
    analysis_file = os.path.join(session_dir, "analysis_options.json")
    if os.path.exists(analysis_file):
        with open(analysis_file, 'r') as f:
            analysis_options = json.load(f)
    
    return {
        "user_id": user_id,
        "session_id": session_id,
        "session_dir": session_dir,
        "files": files,
        "preprocessing_options": preprocessing_options,
        "analysis_options": analysis_options
    }

@app.get("/session/{user_id}/{session_id}/download/{filename}")
def download_session_file(user_id: str, session_id: str, filename: str):
    """Download a specific file from user session"""
    
    session_dir = create_user_session_directory(user_id, session_id)
    file_path = os.path.join(session_dir, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        file_path,
        media_type='application/octet-stream',
        filename=filename
    )

# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(),
        "active_analyses": len(analysis_storage)
    }

# Test endpoint for R integration
@app.get("/test_r")
async def test_r_integration():
    """Test R script integration"""
    try:
        # Test with a simple R script
        result = await run_r_script("test_fastapi.R", {"numbers": 10})
        return {
            "success": True,
            "message": "R integration working",
            "result": result
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"R integration failed: {str(e)}"
        }

# Simple test endpoint for frontend connectivity
@app.get("/test")
def test_connectivity():
    """Simple test endpoint for frontend connectivity"""
    return {
        "success": True,
        "message": "FastAPI backend is running and accessible",
        "timestamp": datetime.now()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_main:app", host="0.0.0.0", port=8000, reload=True)
