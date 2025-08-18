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
import platform
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime
import aiofiles

# Windows compatibility for asyncio, roba per compatibilità con Windows in locale
if platform.system() == "Windows":
    # Set the event loop policy to avoid subprocess issues on Windows
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Logger per vedere l'output di R nella console, come era per Plumber
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
    description="FastAPI backend per l'analisi di dati omici con R",
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
        with open(preprocessing_file, 'w', encoding='utf-8') as f:
            json.dump(preprocessing_options, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved preprocessing options to {preprocessing_file}")
        
        # Save analysis options if provided
        if analysis_options:
            analysis_file = os.path.join(session_dir, "analysis_options.json")
            with open(analysis_file, 'w', encoding='utf-8') as f:
                json.dump(analysis_options, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved analysis options to {analysis_file}")
                
    except Exception as e:
        logger.error(f"Failed to save session options: {e}")
        raise Exception(f"Failed to save session options: {e}")

async def run_r_script(script_name: str, args: Dict[str, Any], timeout: int = 300) -> Dict[str, Any]:
    """Run R script with given arguments and return parsed JSON result"""
    temp_file_path = None
    try:
        
        # Create a temporary file for arguments to avoid JSON escaping issues
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as temp_args_file:
            json.dump(args, temp_args_file, indent=2, ensure_ascii=False)
            temp_file_path = temp_args_file.name
        
        # Verify the temp file was written correctly
        if not os.path.exists(temp_file_path):
            raise Exception(f"Failed to create temporary arguments file: {temp_file_path}")
        
        # Log the temp file content for debugging
        try:
            with open(temp_file_path, 'r', encoding='utf-8') as f:
                temp_content = f.read()
                logger.info(f"Temp file created successfully, size: {len(temp_content)} chars")
        except Exception as e:
            logger.warning(f"Could not verify temp file content: {e}")
        
        # Get absolute path to R script
        project_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(project_dir, script_name)
        
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"R script not found: {script_path}")
        
        # Windows-compatible subprocess execution
        import platform
        if platform.system() == "Windows":
            # Use subprocess.run with asyncio.to_thread for Windows compatibility
            import subprocess
            from functools import partial
            
            def run_r_sync():
                result = subprocess.run(
                    ["Rscript", script_path, temp_file_path],
                    capture_output=True,
                    text=True,
                    timeout=timeout
                )
                return result
            
            # Run in thread to avoid blocking
            result = await asyncio.to_thread(run_r_sync)
            stdout_text = result.stdout
            stderr_text = result.stderr
            returncode = result.returncode
            
        else:
            # Unix/Linux systems - use asyncio subprocess
            proc = await asyncio.create_subprocess_exec(
                "Rscript", script_path, temp_file_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            
            # Decode output with error handling
            try:
                stdout_text = stdout.decode('utf-8')
            except UnicodeDecodeError:
                stdout_text = stdout.decode('utf-8', errors='replace')
            
            try:
                stderr_text = stderr.decode('utf-8')
            except UnicodeDecodeError:
                stderr_text = stderr.decode('utf-8', errors='replace')
                
            returncode = proc.returncode
        
        # Print R script diagnostics to console for debugging
        if stderr_text:
            print(f"\n=== R SCRIPT DIAGNOSTICS ({script_name}) ===", flush=True)
            print(stderr_text, flush=True)
            print("=== END R SCRIPT DIAGNOSTICS ===\n", flush=True)
            
            # Also log using logger for better visibility
            logger.info(f"R Script {script_name} diagnostics:\n{stderr_text}")
        
        if returncode != 0:
            error_msg = f"R script execution failed with return code {returncode}: {stderr_text}"
            logger.error(error_msg)
            raise HTTPException(
                status_code=500, 
                detail=error_msg
            )
        
        try:
            # Try to parse as JSON
            result = json.loads(stdout_text)
            logger.info(f"Successfully parsed R script output for {script_name}")
            return result
        except json.JSONDecodeError as e:
            # Provide detailed error information
            logger.error(f"JSON parsing failed for {script_name}:")
            logger.error(f"JSON Error: {e}")
            logger.error(f"Stdout length: {len(stdout_text)}")
            logger.error(f"First 500 chars of stdout: {stdout_text[:500]}")
            logger.error(f"Last 500 chars of stdout: {stdout_text[-500:]}")
            
            error_msg = f"Failed to parse R script output as JSON: {e}. Check logs for detailed output."
            raise HTTPException(
                status_code=500,
                detail=error_msg
            )
    
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408,
            detail=f"R script execution timed out after {timeout} seconds"
        )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"R script or Rscript not found: {str(e)}"
        )
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        exception_type = type(e).__name__
        exception_str = str(e)
        
        logger.error(f"Exception type: {exception_type}")
        logger.error(f"Exception string: '{exception_str}'")
        logger.error(f"Exception repr: {repr(e)}")
        logger.error(f"Full traceback:\n{error_details}")
        
        # Try different ways to get error info
        if hasattr(e, 'args') and e.args:
            logger.error(f"Exception args: {e.args}")
        
        error_msg = f"R script {script_name} failed: {exception_type}: {exception_str or 'No error message'}"
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )
    finally:
        # Cleanup temporary arguments file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"Cleaned up temp file: {temp_file_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temp args file: {e}")

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "Omics Analysis Dashboard API",
        "version": "1.0.0",
        "status": "running"
    }

# Per inviare opzioni di preprocessing e il file preprocessato
@app.post("/preprocess")
async def preprocess_file(
    file: UploadFile = File(...),
    options: str = Form(...),
    userId: str = Form(...),
    sessionId: str = Form(...)
):
    """Preprocess file e opzioni caricate"""
    
    # Parse opzioni di preprocessing
    try:
        preprocessing_options = json.loads(options)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid preprocessing options JSON")
    
    # Create cartella dell'utente per la sessione (sarà da cambiare in produzione)
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
            "output_dir": session_dir,  # Usa cartella persistente invece di temp
            "options": preprocessing_options
        }
        
        #Lancio R script per preprocessing
        result = await run_r_script("preprocess.R", r_args)
        
        #Controllo di successo
        if not result.get("success", False):
            raise HTTPException(
                status_code=500,
                detail=f"Preprocessing fallito: {result.get('message', 'Unknown error')}"
            )
        
        # Restituisci file
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
                detail="File elaborato non trovato dopo il preprocessing"
            )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

#Lancia l'analisi 
@app.post("/analyze", response_model=AnalysisResult)
async def submit_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sessionId: str = Form(...),
    userId: str = Form(...),
    preprocessingOptions: str = Form(...),
    analysisOptions: str = Form(...)
):
    """Invia la richiesta di analisi e restituisce l'ID dell'analisi"""

    # Parse options
    try:
        preprocessing_opts = json.loads(preprocessingOptions)
        analysis_opts = json.loads(analysisOptions)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Opzioni JSON non valide")

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
    """Effettua l'analisi in background"""
    
    # Extract userId and sessionId from analysis_id
    user_id, session_id = analysis_id.split('_', 1)
    
    # Use persistent user session directory
    session_dir = create_user_session_directory(user_id, session_id)
    
    # Read file content immediately to avoid file closure issues
    try:
        # Check if file is still readable
        if hasattr(file, 'file') and file.file.closed:
            logger.warning(f"File {file.filename} is already closed, trying to reopen from session")
            # Try to find the file in the session directory instead
            if os.path.exists(session_dir):
                session_files = [f for f in os.listdir(session_dir) if f.startswith('original_') or f.startswith('processed_')]
                if session_files:
                    # Use the most recent file
                    most_recent_file = max(session_files, key=lambda f: os.path.getmtime(os.path.join(session_dir, f)))
                    existing_file_path = os.path.join(session_dir, most_recent_file)
                    logger.info(f"Using existing file from session: {existing_file_path}")
                    with open(existing_file_path, 'rb') as f:
                        file_content = f.read()
                else:
                    raise Exception("No existing files found in session and uploaded file is closed")
            else:
                raise Exception("Session directory does not exist and uploaded file is closed")
        else:
            # Try to read the file normally
            try:
                file_content = await file.read()
                logger.info(f"Read {len(file_content)} bytes from uploaded file for analysis {analysis_id}")
            except Exception as read_error:
                logger.warning(f"Failed to read uploaded file, trying to use existing session file: {read_error}")
                # Fallback to session file
                if os.path.exists(session_dir):
                    session_files = [f for f in os.listdir(session_dir) if f.startswith('original_') or f.startswith('processed_')]
                    if session_files:
                        most_recent_file = max(session_files, key=lambda f: os.path.getmtime(os.path.join(session_dir, f)))
                        existing_file_path = os.path.join(session_dir, most_recent_file)
                        logger.info(f"Using existing file from session: {existing_file_path}")
                        with open(existing_file_path, 'rb') as f:
                            file_content = f.read()
                    else:
                        raise Exception(f"Failed to read uploaded file and no session files available: {read_error}")
                else:
                    raise Exception(f"Failed to read uploaded file and session directory does not exist: {read_error}")
                    
    except Exception as e:
        logger.error(f"Failed to read file content: {e}")
        analysis_storage[analysis_id].update({
            "status": "error",
            "error": f"Failed to read file content: {e}",
            "timestamp": datetime.now()
        })
        return
    
    try:
        # Update status to running
        analysis_storage[analysis_id]["status"] = "running"
        logger.info(f"Analysis {analysis_id} started")
        
        # Save uploaded file content
        input_file_path = os.path.join(session_dir, f"analysis_{file.filename}")
        
        # Write the file content that we already read
        try:
            async with aiofiles.open(input_file_path, 'wb') as f:
                await f.write(file_content)
        except Exception as e:
            logger.error(f"Failed to write file to {input_file_path}: {e}")
            raise Exception(f"Failed to write file to session directory: {e}")
        
        logger.info(f"File saved to: {input_file_path}")
        
        # Salva opzioni di analisi 
        save_session_options(session_dir, preprocessing_options, analysis_options)
        
        # Prepara gli args per lo script R
        r_args = {
            "input_file": input_file_path,
            "output_dir": session_dir,  # Use persistent directory
            "preprocessing_options": preprocessing_options,
            "analysis_options": analysis_options,
            "analysis_id": analysis_id
        }
        
        # Lancia script R per l'analisi
        logger.info(f"Starting R script execution for analysis {analysis_id}")
        result = await run_r_script("analysis.R", r_args, timeout=600)  # 10 minutes timeout
        logger.info(f"R script completed for analysis {analysis_id}")
        
        # salva risultati dell'analisi
        results_file = os.path.join(session_dir, "analysis_results.json")
        logger.info(f"Saving results to: {results_file}")
        
        try:
            with open(results_file, 'w') as f:
                json.dump(result, f, indent=2, default=str)
            logger.info(f"Results saved successfully for analysis {analysis_id}")
        except Exception as e:
            logger.error(f"Failed to save results file: {e}")
            raise Exception(f"Failed to save results file: {e}")
        
        # Aggiorna lo storage con lo status e i risultati
        analysis_storage[analysis_id].update({
            "status": "completed",
            "results": result,
            "session_dir": session_dir,
            "timestamp": datetime.now()
        })
        
        logger.info(f"Analysis {analysis_id} completed successfully")
        logger.info(f"Results available at: /results/{analysis_id}")
        logger.info(f"Analysis storage updated with {len(result)} result keys" if isinstance(result, dict) else f"Analysis storage updated with result type: {type(result)}")
    
    except HTTPException as e:
        # Errori HTTP specifici da run_r_script
        logger.error(f"Analysis {analysis_id} failed with HTTP error: {e.detail}")
        analysis_storage[analysis_id].update({
            "status": "error",
            "error": e.detail,
            "timestamp": datetime.now()
        })
    except Exception as e:
        # Altri errori
        logger.error(f"Analysis {analysis_id} failed with unexpected error: {str(e)}")
        analysis_storage[analysis_id].update({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now()
        })

@app.get("/status/{analysis_id}", response_model=AnalysisResult)
def get_analysis_status(analysis_id: str):
    """Ottieni status dell'analisi con informazioni complete"""
    
    # First check if analysis is in memory storage
    if analysis_id in analysis_storage:
        analysis_data = analysis_storage[analysis_id]
        return AnalysisResult(
            id=analysis_data["id"],
            status=analysis_data["status"],
            results=analysis_data.get("results"),
            error=analysis_data.get("error"),
            timestamp=analysis_data["timestamp"]
        )
    
    # If not in memory, try to load from file system
    try:
        # Parse analysis_id to get user_id and session_id
        if "_" in analysis_id:
            user_id, session_id = analysis_id.split("_", 1)
        else:
            # Fallback for legacy format
            user_id = "MasterTest"
            session_id = analysis_id
        
        session_dir = create_user_session_directory(user_id, session_id)
        results_file = os.path.join(session_dir, "analysis_results.json")
        
        if os.path.exists(results_file):
            logger.info(f"Loading existing results from: {results_file}")
            with open(results_file, 'r') as f:
                results = json.load(f)
            
            # Restore to memory storage for future requests
            analysis_storage[analysis_id] = {
                "id": analysis_id,
                "status": "completed",
                "results": results,
                "session_dir": session_dir,
                "timestamp": datetime.now()
            }
            
            return AnalysisResult(
                id=analysis_id,
                status="completed",
                results=results,
                error=None,
                timestamp=datetime.now()
            )
    except Exception as e:
        logger.error(f"Error loading results from file: {e}")
    
    raise HTTPException(status_code=404, detail="Analysis not found")

@app.get("/status/{analysis_id}/simple")
def get_analysis_status_simple(analysis_id: str):
    """Ottieni solo lo status dell'analisi per polling leggero"""
    
    if analysis_id not in analysis_storage:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    analysis_data = analysis_storage[analysis_id]
    
    return {
        "id": analysis_id,
        "status": analysis_data["status"],
        "hasResults": analysis_data.get("results") is not None,
        "hasError": analysis_data.get("error") is not None,
        "timestamp": analysis_data["timestamp"],
        "message": "Analysis completed successfully" if analysis_data["status"] == "completed" else None
    }

@app.get("/results/{analysis_id}", response_model=AnalysisResult)
def get_analysis_results(analysis_id: str):
    """Ottieni risultati dell'analisi"""
    
    # First check if analysis is in memory storage
    if analysis_id in analysis_storage:
        analysis_data = analysis_storage[analysis_id]
        return AnalysisResult(
            id=analysis_data["id"],
            status=analysis_data["status"],
            results=analysis_data.get("results"),
            error=analysis_data.get("error"),
            timestamp=analysis_data["timestamp"]
        )
    
    # If not in memory, try to load from file system
    try:
        # Parse analysis_id to get user_id and session_id
        if "_" in analysis_id:
            user_id, session_id = analysis_id.split("_", 1)
        else:
            # Fallback for legacy format
            user_id = "MasterTest"
            session_id = analysis_id
        
        session_dir = create_user_session_directory(user_id, session_id)
        results_file = os.path.join(session_dir, "analysis_results.json")
        
        if os.path.exists(results_file):
            logger.info(f"Loading existing results from: {results_file}")
            with open(results_file, 'r') as f:
                results = json.load(f)
            
            # Restore to memory storage for future requests
            analysis_storage[analysis_id] = {
                "id": analysis_id,
                "status": "completed",
                "results": results,
                "session_dir": session_dir,
                "timestamp": datetime.now()
            }
            
            return AnalysisResult(
                id=analysis_id,
                status="completed",
                results=results,
                error=None,
                timestamp=datetime.now()
            )
        else:
            logger.warning(f"Results file not found: {results_file}")
    except Exception as e:
        logger.error(f"Error loading results from file: {e}")
    
    raise HTTPException(status_code=404, detail="Analysis not found")

#Ottieni informazioni sulla sessione e lista dei file
@app.get("/session/{user_id}/{session_id}")
def get_session_info(user_id: str, session_id: str):
    """Ottieni informazioni sulla sessione e lista dei file"""
    
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
    
    # Carica le opzioni di preprocessing e analisi, se esistono
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

#Superficiale in production, ma utile per test in locale
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

# Test per ll'health? (autoprodotto da GPT)
@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(),
        "active_analyses": len(analysis_storage)
    }

# Test per l'endpoint di R (autoprodotto da GPT)
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

# Test per l'endpoint (autoprodotto da GPT)
@app.get("/test")
def test_connectivity():
    """Simple test endpoint for frontend connectivity"""
    return {
        "success": True,
        "message": "FastAPI backend is running and accessible",
        "timestamp": datetime.now()
    }

# Debug endpoint per vedere tutte le analisi
@app.get("/debug/analyses")
def debug_all_analyses():
    """Debug endpoint to see all current analyses"""
    return {
        "total_analyses": len(analysis_storage),
        "analyses": {
            aid: {
                "id": data["id"],
                "status": data["status"],
                "has_results": data.get("results") is not None,
                "has_error": data.get("error") is not None,
                "timestamp": data["timestamp"],
                "error": data.get("error")
            } for aid, data in analysis_storage.items()
        }
    }

if __name__ == "__main__":
    import uvicorn
    import socket
    
    def find_free_port(start_port=8000, max_attempts=10):
        """Find a free port starting from start_port"""
        for port in range(start_port, start_port + max_attempts):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('localhost', port))
                    return port
            except OSError:
                continue
        raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts}")
    
    try:
        port = find_free_port(8000)
        print(f"Starting FastAPI server on port {port}")
        uvicorn.run("fastapi_main:app", host="0.0.0.0", port=port, reload=True)
    except Exception as e:
        print(f"Error starting server: {e}")
        print("Try manually killing any existing Python processes and restart.")
