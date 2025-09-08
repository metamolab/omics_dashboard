from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator, ValidationError
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
import traceback
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime
from enum import Enum
import aiofiles

# Compatibilità Windows per asyncio, roba per compatibilità con Windows in locale
if platform.system() == "Windows":
    # Imposta la policy del loop di eventi per evitare problemi subprocess su Windows
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
    allow_origins=["http://localhost:4200"],  # Porta dev Angular
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage globale (temporaneo?)
analysis_storage: Dict[str, Dict[str, Any]] = {}

# Modelli Pydantic per controllo dell'input
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

# Enhanced Pydantic models with validation

class TransformationMethodEnum(str, Enum):
    """Allowed transformation methods - based on frontend interfaces.ts"""
    none = "none"
    scale = "scale"
    center = "center"
    standardize = "standardize"
    log = "log"
    log2 = "log2"
    yeo_johnson = "yeo-johnson"

class MissingValueMethodEnum(str, Enum):
    """Allowed missing value handling methods - based on frontend interfaces.ts"""
    none = "none"
    mean = "mean"
    median = "median"
    knn5 = "knn5"

class OutlierMethodEnum(str, Enum):
    """Allowed outlier detection methods - based on frontend interfaces.ts"""
    iqr = "iqr"
    zscore = "zscore"
    isolation = "isolation"

class OutcomeTypeEnum(str, Enum):
    """Allowed outcome types - based on frontend interfaces.ts"""
    continuous = "continuous"
    categorical = "categorical"
    auto_detect = "auto-detect"

class AnalysisTypeEnum(str, Enum):
    """Allowed analysis types"""
    pca = "pca"
    plsda = "plsda"
    boruta = "boruta"
    student_t = "student-t"
    limma = "limma"

class PreprocessingOptions(BaseModel):
    """Enhanced preprocessing options with validation matching frontend interfaces.ts"""
    transformation: TransformationMethodEnum = Field(default="none", description="Data transformation method")
    fillMissingValues: MissingValueMethodEnum = Field(default="none", description="Missing value handling")
    removeOutliers: bool = Field(default=False, description="Whether to remove outliers")
    outlierMethod: OutlierMethodEnum = Field(default="iqr", description="Outlier detection method")
    removeNullValues: bool = Field(default=False, description="Whether to remove null values")
    
    # Column classification with validation matching frontend structure
    columnClassification: Dict[str, Any] = Field(default_factory=dict, description="Column type classification")
    
    # Missing data removal options (expected by R script)
    missingDataRemoval: Optional[Dict[str, Any]] = Field(default=None, description="Missing data removal configuration")
    
    # Analysis type (expected by R script)
    analysisType: Optional[str] = Field(default=None, description="Type of analysis")
    
    # Session information (expected by R script)
    sessionId: Optional[str] = Field(default=None, description="Session ID")
    userId: Optional[str] = Field(default=None, description="User ID")
    
    @field_validator('columnClassification')
    @classmethod
    def validate_column_classification(cls, v):
        """Validate column classification structure based on frontend ColumnClassification interface"""
        if not isinstance(v, dict):
            raise ValueError("columnClassification must be a dictionary")
        
        # Check required keys exist if provided - based on frontend interfaces.ts
        allowed_keys = {
            'idColumn', 'outcomeColumn', 'covariateColumns', 'omicsColumns', 
            'categoricalColumns', 'outcomeType'  # Frontend structure
        }
        for key in v.keys():
            if key not in allowed_keys:
                raise ValueError(f"Invalid column classification key: {key}")
        
        # Validate ID column (can be null for row indices)
        if 'idColumn' in v:
            if v['idColumn'] is not None and not isinstance(v['idColumn'], str):
                raise ValueError("idColumn must be a string or null")
        
        # Validate outcome column (can be empty string initially)
        if 'outcomeColumn' in v:
            if not isinstance(v['outcomeColumn'], str):
                raise ValueError("outcomeColumn must be a string")
        
        # Validate covariate columns
        if 'covariateColumns' in v:
            if not isinstance(v['covariateColumns'], list):
                raise ValueError("covariateColumns must be a list")
        
        # Validate omics columns
        if 'omicsColumns' in v:
            if not isinstance(v['omicsColumns'], list):
                raise ValueError("omicsColumns must be a list")
        
        # Validate categorical columns
        if 'categoricalColumns' in v:
            if not isinstance(v['categoricalColumns'], list):
                raise ValueError("categoricalColumns must be a list")
        
        # Validate outcome type
        if 'outcomeType' in v and v['outcomeType']:
            valid_outcome_types = {'continuous', 'categorical', 'auto-detect'}
            if v['outcomeType'] not in valid_outcome_types:
                raise ValueError(f"outcomeType must be one of {valid_outcome_types}")
        
        return v
    
    @field_validator('missingDataRemoval')
    @classmethod
    def validate_missing_data_removal(cls, v):
        """Validate missing data removal options"""
        if v is not None:
            if not isinstance(v, dict):
                raise ValueError("missingDataRemoval must be a dictionary")
            
            # Validate structure expected by R script
            allowed_keys = {'enabled', 'threshold', 'columnsToRemove'}
            for key in v.keys():
                if key not in allowed_keys:
                    raise ValueError(f"Invalid missingDataRemoval key: {key}")
            
            if 'enabled' in v and not isinstance(v['enabled'], bool):
                raise ValueError("missingDataRemoval.enabled must be a boolean")
            
            if 'threshold' in v and not isinstance(v['threshold'], (int, float)):
                raise ValueError("missingDataRemoval.threshold must be a number")
                
            if 'columnsToRemove' in v and not isinstance(v['columnsToRemove'], list):
                raise ValueError("missingDataRemoval.columnsToRemove must be a list")
        
        return v
    
    @field_validator('removeOutliers')
    @classmethod
    def validate_outlier_settings(cls, v, info):
        """Basic validation for outlier removal setting"""
        # The outlierMethod enum validation handles the method validation
        # This validator can be simplified or removed since enum handles validation
        return v

class MultivariateMethodConfig(BaseModel):
    """Configuration for multivariate analysis methods (Ridge, Lasso, ElasticNet)"""
    enabled: bool = Field(default=False)
    lambdaSelection: Literal['automatic', 'manual'] = Field(default='automatic')
    lambdaRange: Optional[Dict[str, float]] = Field(default=None)
    metric: Literal['rmse', 'rsquared', 'accuracy', 'auc', 'f1', 'kappa'] = Field(default='rmse')
    lambdaRule: Literal['min', '1se'] = Field(default='min')
    includeCovariates: bool = Field(default=False)

class RandomForestConfig(BaseModel):
    """Configuration for Random Forest analysis"""
    enabled: bool = Field(default=False)
    ntree: Literal[100, 500, 1000] = Field(default=100)
    mtrySelection: Literal['automatic', 'tuning', 'manual'] = Field(default='automatic')
    mtryValue: int = Field(default=1, ge=1)
    includeCovariates: bool = Field(default=False)

class BorutaConfig(BaseModel):
    """Configuration for Boruta feature selection"""
    enabled: bool = Field(default=False)
    ntree: Literal[100, 500, 1000] = Field(default=100)
    mtrySelection: Literal['automatic', 'manual'] = Field(default='automatic')
    mtryValue: int = Field(default=1, ge=1)
    maxRuns: int = Field(default=100, ge=1, le=1000)
    roughFixTentativeFeatures: bool = Field(default=False)
    includeCovariates: bool = Field(default=False)

class RFEConfig(BaseModel):
    """Configuration for Recursive Feature Elimination"""
    enabled: bool = Field(default=False)
    metric: Literal['rmse', 'rsquared', 'accuracy', 'auc', 'f1', 'kappa'] = Field(default='rmse')
    subsetSizeType: Literal['automatic', 'custom'] = Field(default='automatic')
    customSubsetSizes: Optional[str] = Field(default=None)
    includeCovariates: bool = Field(default=False)

class MultivariateAnalysisConfig(BaseModel):
    """Configuration for all multivariate analysis methods"""
    ridge: MultivariateMethodConfig = Field(default_factory=MultivariateMethodConfig)
    lasso: MultivariateMethodConfig = Field(default_factory=MultivariateMethodConfig)
    elasticNet: MultivariateMethodConfig = Field(default_factory=MultivariateMethodConfig)
    randomForest: RandomForestConfig = Field(default_factory=RandomForestConfig)
    boruta: BorutaConfig = Field(default_factory=BorutaConfig)
    rfe: RFEConfig = Field(default_factory=RFEConfig)

class AnalysisOptions(BaseModel):
    """Enhanced analysis options with comprehensive validation"""
    sessionId: Optional[str] = Field(default=None, description="Session ID")
    userId: Optional[str] = Field(default=None, description="User ID")
    groupingMethod: Literal['none', 'tertiles', 'threshold'] = Field(default='none')
    thresholdValues: Optional[List[float]] = Field(default=None, description="Threshold values for grouping")
    statisticalTests: List[str] = Field(default_factory=list, description="List of statistical tests to perform")
    linearRegression: bool = Field(default=False)
    linearRegressionWithoutInfluentials: bool = Field(default=False)
    multivariateAnalysis: MultivariateAnalysisConfig = Field(default_factory=MultivariateAnalysisConfig)
    clusteringMethod: Optional[str] = Field(default=None)
    customAnalysis: Optional[Dict[str, Any]] = Field(default=None)
    analysisType: Optional[Literal['regression', 'classification']] = Field(default=None)
    
    @field_validator('statisticalTests')
    @classmethod
    def validate_statistical_tests(cls, v):
        """Validate statistical test names"""
        valid_tests = {
            'student-t', 'welch-t', 'wilcoxon', 'anova', 'welch-anova', 'kruskal-wallis', 
            'pearson', 'spearman', 'linearregression'
        }
        for test in v:
            if test not in valid_tests:
                raise ValueError(f"Invalid statistical test: {test}. Valid tests: {valid_tests}")
        return v
    
    @field_validator('thresholdValues')
    @classmethod
    def validate_threshold_values(cls, v, info):
        """Validate threshold values based on grouping method"""
        if info.data.get('groupingMethod') == 'threshold':
            if not v or len(v) < 2:
                raise ValueError("Threshold values required for threshold grouping method")
            if len(v) > 2:
                raise ValueError("Maximum 2 threshold values allowed")
        return v


class FileUploadRequest(BaseModel):
    """Validation for file upload metadata"""
    userId: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    sessionId: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    filename: Optional[str] = Field(None, max_length=255)
    
    @field_validator('filename')
    @classmethod
    def validate_filename(cls, v):
        """Validate filename for security"""
        if v:
            import re
            # Check for path traversal attempts
            if '..' in v or '/' in v or '\\' in v:
                raise ValueError("Invalid filename: path traversal not allowed")
            # Check for suspicious extensions
            if v.lower().endswith(('.exe', '.bat', '.cmd', '.scr', '.pif')):
                raise ValueError("Invalid file type")
        return v

class AnalysisRequest(BaseModel):
    """Enhanced analysis request validation"""
    sessionId: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    userId: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    preprocessingOptions: PreprocessingOptions
    analysisOptions: AnalysisOptions
    
    class Config:
        # Enable validation on assignment
        validate_assignment = True
        # Use enum values instead of names
        use_enum_values = True

# Funzioni di utilità (create da lui)
def create_temp_directory() -> str:
    """Crea una directory temporanea per l'elaborazione dei file"""
    return tempfile.mkdtemp()

def create_user_session_directory(user_id: str, session_id: str) -> str:
    """Crea una directory persistente per i dati della sessione utente"""
    # Crea il nome della directory combinando userId e sessionId
    dir_name = f"{user_id}_{session_id}"
    
    # Crea il percorso completo nella directory del progetto
    project_dir = os.path.dirname(os.path.abspath(__file__))
    session_dir = os.path.join(project_dir, "user_sessions", dir_name)
    
    # Crea la directory se non esiste
    os.makedirs(session_dir, exist_ok=True)
    
    return session_dir

def cleanup_temp_directory(temp_dir: str):
    """Pulisce la directory temporanea"""
    try:
        shutil.rmtree(temp_dir)
    except Exception as e:
        print(f"Warning: Failed to cleanup temp directory {temp_dir}: {e}")

def save_session_options(session_dir: str, preprocessing_options: dict, analysis_options: dict = None):
    """Salva le opzioni della sessione nei file per riferimento futuro"""
    try:
        # Salva le opzioni di preprocessing
        preprocessing_file = os.path.join(session_dir, "preprocessing_options.json")
        with open(preprocessing_file, 'w', encoding='utf-8') as f:
            json.dump(preprocessing_options, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved preprocessing options to {preprocessing_file}")
        
        # Salva le opzioni di analisi se fornite
        if analysis_options:
            analysis_file = os.path.join(session_dir, "analysis_options.json")
            with open(analysis_file, 'w', encoding='utf-8') as f:
                json.dump(analysis_options, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved analysis options to {analysis_file}")
                
    except Exception as e:
        logger.error(f"Failed to save session options: {e}")
        raise Exception(f"Failed to save session options: {e}")

async def run_r_script(script_name: str, args: Dict[str, Any], timeout: int = 1800) -> Dict[str, Any]:
    """Esegue uno script R con argomenti dati e restituisce il risultato JSON parsato"""
    temp_file_path = None
    try:
        
        # Crea un file temporaneo per gli argomenti per evitare problemi di escape JSON
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as temp_args_file:
            json.dump(args, temp_args_file, indent=2, ensure_ascii=False)
            temp_file_path = temp_args_file.name
        
        # Verifica che il file temporaneo sia stato scritto correttamente
        if not os.path.exists(temp_file_path):
            raise Exception(f"Failed to create temporary arguments file: {temp_file_path}")
        
        # Registra il contenuto del file temporaneo per debug
        try:
            with open(temp_file_path, 'r', encoding='utf-8') as f:
                temp_content = f.read()
                logger.info(f"Temp file created successfully, size: {len(temp_content)} chars")
        except Exception as e:
            logger.warning(f"Could not verify temp file content: {e}")
        
        # Ottieni il percorso assoluto dello script R
        project_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(project_dir, script_name)
        
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"R script not found: {script_path}")
        
        # Esecuzione subprocess compatibile con Windows
        import platform
        if platform.system() == "Windows":
            # Usa subprocess.run con asyncio.to_thread per compatibilità Windows
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
            
            # Esegui in thread per evitare il blocco
            result = await asyncio.to_thread(run_r_sync)
            stdout_text = result.stdout
            stderr_text = result.stderr
            returncode = result.returncode
            
        else:
            # Sistemi Unix/Linux - usa subprocess asyncio
            proc = await asyncio.create_subprocess_exec(
                "Rscript", script_path, temp_file_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            
            # Decodifica l'output con gestione degli errori
            try:
                stdout_text = stdout.decode('utf-8')
            except UnicodeDecodeError:
                stdout_text = stdout.decode('utf-8', errors='replace')
            
            try:
                stderr_text = stderr.decode('utf-8')
            except UnicodeDecodeError:
                stderr_text = stderr.decode('utf-8', errors='replace')
                
            returncode = proc.returncode
        
        # Stampa la diagnostica dello script R nella console per debug
        if stderr_text:
            print(f"\n=== R SCRIPT DIAGNOSTICS ({script_name}) ===", flush=True)
            print(stderr_text, flush=True)
            print("=== END R SCRIPT DIAGNOSTICS ===\n", flush=True)
            
            # Registra anche usando logger per migliore visibilità
            logger.info(f"R Script {script_name} diagnostics:\n{stderr_text}")
        
        if returncode != 0:
            error_msg = f"R script execution failed with return code {returncode}: {stderr_text}"
            logger.error(error_msg)
            raise HTTPException(
                status_code=500, 
                detail=error_msg
            )
        
        try:
            # Prova a parsare come JSON
            result = json.loads(stdout_text)
            logger.info(f"Successfully parsed R script output for {script_name}")
            return result
        except json.JSONDecodeError as e:
            # Fornisce informazioni dettagliate sull'errore
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
        
        # Prova diversi modi per ottenere info sull'errore
        if hasattr(e, 'args') and e.args:
            logger.error(f"Exception args: {e.args}")
        
        error_msg = f"R script {script_name} failed: {exception_type}: {exception_str or 'No error message'}"
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )
    finally:
        # Pulisce il file temporaneo degli argomenti
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"Cleaned up temp file: {temp_file_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup temp args file: {e}")

# Endpoint API
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
    """Preprocess file with enhanced validation"""
    
    logger.info(f"Preprocessing request received - userId: {userId}, sessionId: {sessionId}, filename: {file.filename}")
    
    # Validate file upload request
    try:
        upload_request = FileUploadRequest(
            userId=userId,
            sessionId=sessionId,
            filename=file.filename
        )
        logger.info("File upload request validation passed")
    except ValidationError as e:
        logger.error(f"File upload validation failed: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")
    
    # Parse and validate preprocessing options
    try:
        logger.info(f"Parsing preprocessing options: {options[:100]}...")  # Log first 100 chars
        preprocessing_options_dict = json.loads(options)
        preprocessing_options = PreprocessingOptions(**preprocessing_options_dict)
        logger.info("Preprocessing options validation passed")
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid preprocessing options JSON")
    except ValidationError as e:
        logger.error(f"Preprocessing options validation failed: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid preprocessing options: {e}")
    
    # Validate file type
    if file.filename:
        allowed_extensions = {'.csv', '.tsv', '.txt', '.xlsx', '.xls'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type {file_ext}. Allowed types: {', '.join(allowed_extensions)}"
            )
    
    # Read file content once
    content = await file.read()
    
    # Crea cartella dell'utente per la sessione
    session_dir = create_user_session_directory(userId, sessionId)
    
    try:
        # Salva il file caricato con il nome originale
        input_file_path = os.path.join(session_dir, f"original_{file.filename}")
        async with aiofiles.open(input_file_path, 'wb') as f:
            await f.write(content)
        
        # Convert Pydantic model to dict for R script
        preprocessing_options_dict = preprocessing_options.dict()
        
        # Add sessionId and userId that R script expects
        preprocessing_options_dict['sessionId'] = sessionId
        preprocessing_options_dict['userId'] = userId
        
        # Salva le opzioni di preprocessing per riferimento futuro
        save_session_options(session_dir, preprocessing_options_dict)
        
        # Prepara gli argomenti per lo script R di preprocessing
        r_args = {
            "input_file": input_file_path,
            "output_dir": session_dir,
            "options": preprocessing_options_dict
        }
        
        # Lancia lo script R per preprocessing
        result = await run_r_script("preprocess.R", r_args, timeout=900)
        
        # Controllo di successo
        if not result.get("success", False):
            raise HTTPException(
                status_code=500,
                detail=f"Preprocessing fallito: {result.get('message', 'Unknown error')}"
            )
        
        # Restituisci il file
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

# Lancia l'analisi 
@app.post("/analyze", response_model=AnalysisResult)
async def submit_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sessionId: str = Form(...),
    userId: str = Form(...),
    preprocessingOptions: str = Form(...),
    analysisOptions: str = Form(...)
):
    """Submit analysis with enhanced validation"""

    # Validate basic request parameters
    try:
        upload_request = FileUploadRequest(
            userId=userId,
            sessionId=sessionId,
            filename=file.filename
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")

    # Parse and validate options
    try:
        preprocessing_opts_dict = json.loads(preprocessingOptions)
        analysis_opts_dict = json.loads(analysisOptions)
        
        # Validate using Pydantic models
        preprocessing_opts = PreprocessingOptions(**preprocessing_opts_dict)
        analysis_opts = AnalysisOptions(**analysis_opts_dict)
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid options JSON format")
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid options: {e}")

    # Validate file type
    if file.filename:
        allowed_extensions = {'.csv', '.tsv', '.txt', '.xlsx', '.xls'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type {file_ext}. Allowed types: {', '.join(allowed_extensions)}"
            )

    # Crea l'ID dell'analisi
    analysis_id = f"{userId}_{sessionId}"
    
    # Check for duplicate analysis
    if analysis_id in analysis_storage:
        existing_status = analysis_storage[analysis_id].get("status")
        if existing_status in ["pending", "running"]:
            raise HTTPException(
                status_code=409, 
                detail="Analysis already in progress for this session"
            )
    
    # Inizializza lo storage dell'analisi
    analysis_storage[analysis_id] = {
        "id": analysis_id,
        "status": "pending",
        "results": None,
        "error": None,
        "timestamp": datetime.now(),
        "user_id": userId,
        "session_id": sessionId
    }
    
    # Avvia l'analisi in background
    background_tasks.add_task(
        perform_analysis,
        analysis_id,
        file,
        preprocessing_opts.dict(),  # Convert to dict for R script
        analysis_opts.dict()       # Convert to dict for R script
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
    
    # Estrae userId e sessionId dall'analysis_id
    user_id, session_id = analysis_id.split('_', 1)
    
    # Usa la directory persistente della sessione utente
    session_dir = create_user_session_directory(user_id, session_id)
    
    # Legge immediatamente il contenuto del file per evitare problemi di chiusura file
    try:
        # Controlla se il file è ancora leggibile
        if hasattr(file, 'file') and file.file.closed:
            logger.warning(f"File {file.filename} is already closed, trying to reopen from session")
            # Prova a trovare il file nella directory della sessione invece
            if os.path.exists(session_dir):
                session_files = [f for f in os.listdir(session_dir) if f.startswith('original_') or f.startswith('processed_')]
                if session_files:
                    # Usa il file più recente
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
            # Prova a leggere il file normalmente
            try:
                file_content = await file.read()
                logger.info(f"Read {len(file_content)} bytes from uploaded file for analysis {analysis_id}")
            except Exception as read_error:
                logger.warning(f"Failed to read uploaded file, trying to use existing session file: {read_error}")
                # Fallback al file della sessione
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
        # Aggiorna lo status a running
        analysis_storage[analysis_id]["status"] = "running"
        logger.info(f"Analysis {analysis_id} started")
        
        # Salva il contenuto del file caricato
        input_file_path = os.path.join(session_dir, f"analysis_{file.filename}")
        
        # Scrive il contenuto del file che abbiamo già letto
        try:
            async with aiofiles.open(input_file_path, 'wb') as f:
                await f.write(file_content)
        except Exception as e:
            logger.error(f"Failed to write file to {input_file_path}: {e}")
            raise Exception(f"Failed to write file to session directory: {e}")
        
        logger.info(f"File saved to: {input_file_path}")
        
        # Salva le opzioni di analisi 
        save_session_options(session_dir, preprocessing_options, analysis_options)
        
        # Prepara gli argomenti per lo script R
        r_args = {
            "input_file": input_file_path,
            "output_dir": session_dir,  # Usa directory persistente
            "preprocessing_options": preprocessing_options,
            "analysis_options": analysis_options,
            "analysis_id": analysis_id
        }
        
        # Lancia lo script R per l'analisi
        logger.info(f"Starting R script execution for analysis {analysis_id}")
        result = await run_r_script("analysis.R", r_args, timeout=3600)  # timeout di 1 ora (aumentato da 10 minuti)
        logger.info(f"R script completed for analysis {analysis_id}")
        
        # Salva i risultati dell'analisi
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
    """Ottieni lo status dell'analisi con informazioni complete"""
    
    # Prima controlla se l'analisi è nel memory storage
    if analysis_id in analysis_storage:
        analysis_data = analysis_storage[analysis_id]
        return AnalysisResult(
            id=analysis_data["id"],
            status=analysis_data["status"],
            results=analysis_data.get("results"),
            error=analysis_data.get("error"),
            timestamp=analysis_data["timestamp"]
        )
    
    # Se non in memoria, prova a caricare dal file system
    try:
        # Parsa analysis_id per ottenere user_id e session_id
        if "_" in analysis_id:
            user_id, session_id = analysis_id.split("_", 1)
        else:
            # For plain UUIDs, assume it's a session ID and try to find the corresponding user session
            # First try to find any session directory that ends with this session ID
            session_id = analysis_id
            user_id = None
            
            # Look for existing session directories
            if os.path.exists("user_sessions"):
                for session_dir_name in os.listdir("user_sessions"):
                    if session_dir_name.endswith(f"_{session_id}"):
                        user_id = session_dir_name.split("_")[0]
                        break
            
            # If not found, default to MasterTest for backward compatibility
            if not user_id:
                user_id = "MasterTest"
        
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
            # For plain UUIDs, assume it's a session ID and try to find the corresponding user session
            # First try to find any session directory that ends with this session ID
            session_id = analysis_id
            user_id = None
            
            # Look for existing session directories
            if os.path.exists("user_sessions"):
                for session_dir_name in os.listdir("user_sessions"):
                    if session_dir_name.endswith(f"_{session_id}"):
                        user_id = session_dir_name.split("_")[0]
                        break
            
            # If not found, default to MasterTest for backward compatibility
            if not user_id:
                user_id = "MasterTest"
        
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
    """Endpoint di test semplice per la connettività frontend"""
    return {
        "success": True,
        "message": "FastAPI backend is running and accessible",
        "timestamp": datetime.now()
    }

# Ottieni le analisi precedenti dalle sessioni utente
@app.get("/analyses")
def get_previous_analyses():
    """Ottieni la lista delle analisi precedenti dalla cartella user sessions"""
    try:
        user_sessions_dir = "user_sessions"
        analyses = []
        
        if not os.path.exists(user_sessions_dir):
            return analyses
        
        # Scansiona le directory delle sessioni utente
        for session_folder in os.listdir(user_sessions_dir):
            session_path = os.path.join(user_sessions_dir, session_folder)
            if os.path.isdir(session_path):
                # Controlla se questa sessione ha dati di analisi
                original_file_path = None
                processed_file_path = None
                preprocessing_options_path = None
                results_file_path = None
                
                # Cerca i file chiave nella sessione
                for file in os.listdir(session_path):
                    if file.startswith("original_"):
                        original_file_path = os.path.join(session_path, file)
                    elif file == "processed_data.csv":
                        processed_file_path = os.path.join(session_path, file)
                    elif file == "preprocessing_options.json":
                        preprocessing_options_path = os.path.join(session_path, file)
                    elif file in ["analysis_results.json", "complete_results.json", "results.json"]:
                        results_file_path = os.path.join(session_path, file)
                        # Controlla anche eventuali file CSV di analisi processata che indicano completamento
                    elif file.startswith("analysis_processed_") and file.endswith(".csv"):
                        # Questo indica che l'analisi è stata completata e processata
                        if not results_file_path:  # Imposta solo se non abbiamo un file di risultati JSON
                            results_file_path = os.path.join(session_path, file)
                
                if original_file_path:  # Include solo sessioni con dati
                    # Estrae il nome del dataset dal file originale
                    dataset_name = os.path.basename(original_file_path).replace("original_", "")
                    
                    # Determina lo status dell'analisi
                    status = "pending"
                    analysis_type = "Unknown"
                    description = None
                    completed_date = None
                    
                    if results_file_path and os.path.exists(results_file_path):
                        status = "completed"
                        # Try to read analysis type from results
                        try:
                            if results_file_path.endswith('.json'):
                                with open(results_file_path, 'r') as f:
                                    results_data = json.load(f)
                                    # Check if this looks like a complete analysis results file
                                    if 'results' in results_data or 'student-t' in results_data or 'analysis_type' in results_data:
                                        analysis_type = results_data.get("analysis_type", "Multivariate Analysis")
                                        description = results_data.get("description", "Completed analysis")
                                    else:
                                        # File exists but might not be complete
                                        status = "running"
                            else:
                                # CSV file indicates completion
                                analysis_type = "Data Analysis"
                                description = "Analysis completed with processed output"
                            completed_date = datetime.fromtimestamp(os.path.getmtime(results_file_path))
                        except Exception as e:
                            logger.warning(f"Error reading results file {results_file_path}: {e}")
                            # If we can't read the results file, it might be corrupted or incomplete
                            status = "running"
                    elif processed_file_path and os.path.exists(processed_file_path):
                        # Has processed data but no results yet
                        status = "running" 
                        analysis_type = "Data Processing"
                        description = "Analysis in progress"
                    else:
                        # Only has original file
                        status = "pending"
                        analysis_type = "Data Upload"
                        description = "Ready for processing"
                    
                    # Get creation date from original file
                    created_date = datetime.fromtimestamp(os.path.getctime(original_file_path))
                    
                    analysis = {
                        "analysisId": session_folder.split('_')[-1] if '_' in session_folder else session_folder,
                        "name": f"Analysis {session_folder}",
                        "datasetName": dataset_name,
                        "analysisType": analysis_type,
                        "status": status,
                        "createdDate": created_date.isoformat(),
                        "completedDate": completed_date.isoformat() if completed_date else None,
                        "description": description
                    }
                    
                    analyses.append(analysis)
        
        # Sort by creation date, newest first
        analyses.sort(key=lambda x: x["createdDate"], reverse=True)
        
        return analyses
        
    except Exception as e:
        logger.error(f"Error getting previous analyses: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving previous analyses: {str(e)}")

# Debug endpoint per vedere tutte le analisi
@app.get("/debug/analyses")
def debug_all_analyses():
    """Endpoint di debug per vedere tutte le analisi correnti"""
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

# Ottieni le opzioni di preprocessing dalle sessioni utente
@app.get("/preprocessing-options")
def get_preprocessing_options():
    """Ottieni le opzioni di preprocessing disponibili da tutte le sessioni utente"""
    try:
        user_sessions_dir = "user_sessions"
        preprocessing_options = []
        
        if not os.path.exists(user_sessions_dir):
            return preprocessing_options
        
        # Scan through user session directories
        for session_folder in os.listdir(user_sessions_dir):
            session_path = os.path.join(user_sessions_dir, session_folder)
            if os.path.isdir(session_path):
                preprocessing_file = os.path.join(session_path, "preprocessing_options.json")
                
                if os.path.exists(preprocessing_file):
                    try:
                        with open(preprocessing_file, 'r', encoding='utf-8') as f:
                            options_data = json.load(f)
                        
                        # Extract session info from folder name
                        session_parts = session_folder.split('_')
                        user_id = session_parts[0] if session_parts else 'Unknown'
                        session_id = '_'.join(session_parts[1:]) if len(session_parts) > 1 else session_folder
                        
                        # Get creation date from file stats
                        file_stats = os.stat(preprocessing_file)
                        created_date = datetime.fromtimestamp(file_stats.st_ctime)
                        
                        # Extract original file name if available
                        original_file_name = "Unknown dataset"
                        for file in os.listdir(session_path):
                            if file.startswith("original_"):
                                original_file_name = file.replace("original_", "")
                                break
                        
                        # Generate a descriptive name based on the configuration
                        preprocessing_name = generate_preprocessing_name(options_data, original_file_name)
                        
                        preprocessing_option = {
                            "sessionId": session_folder,  # Use full folder name as ID
                            "userId": user_id,
                            "name": preprocessing_name,
                            "description": generate_preprocessing_description(options_data),
                            "options": options_data,
                            "createdDate": created_date.isoformat(),
                            "originalDataset": original_file_name
                        }
                        
                        preprocessing_options.append(preprocessing_option)
                        
                    except Exception as e:
                        logger.warning(f"Error reading preprocessing options from {preprocessing_file}: {e}")
                        continue
        
        # Sort by creation date (newest first)
        preprocessing_options.sort(key=lambda x: x["createdDate"], reverse=True)
        
        logger.info(f"Found {len(preprocessing_options)} preprocessing option sets")
        return preprocessing_options
        
    except Exception as e:
        logger.error(f"Error getting preprocessing options: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving preprocessing options: {str(e)}")

def generate_preprocessing_name(options: dict, dataset_name: str) -> str:
    """Generate a descriptive name for preprocessing options"""
    base_name = f"Preprocessing per {dataset_name}"
    
    # Add key characteristics
    characteristics = []
    
    if options.get("transformation") and options["transformation"] != "none":
        characteristics.append(options["transformation"])
    
    if options.get("fillMissingValues") and options["fillMissingValues"] != "none":
        characteristics.append(f"missing: {options['fillMissingValues']}")
    
    if options.get("removeOutliers"):
        characteristics.append("no outliers")
    
    if characteristics:
        return f"{base_name} ({', '.join(characteristics)})"
    
    return base_name

def generate_preprocessing_description(options: dict) -> str:
    """Generate a detailed description of preprocessing options"""
    descriptions = []
    
    # Column classification
    column_class = options.get("columnClassification", {})
    if column_class:
        if column_class.get("outcomeColumn"):
            descriptions.append(f"Outcome: {column_class['outcomeColumn']}")
        
        covariates = column_class.get("covariateColumns", [])
        if covariates:
            descriptions.append(f"Covariates: {len(covariates)} columns")
        
        omics = column_class.get("omicsColumns", [])
        if omics:
            descriptions.append(f"Omics: {len(omics)} features")
    
    # Transformation
    transformation = options.get("transformation", "none")
    if transformation != "none":
        descriptions.append(f"Transform: {transformation}")
    
    # Missing values
    missing_handling = options.get("fillMissingValues", "none")
    if missing_handling != "none":
        descriptions.append(f"Missing values: {missing_handling}")
    
    # Outliers
    if options.get("removeOutliers"):
        method = options.get("outlierMethod", "unknown")
        descriptions.append(f"Outlier removal: {method}")
    
    # Null values
    if options.get("removeNullValues"):
        descriptions.append("Remove null values")
    
    return "; ".join(descriptions) if descriptions else "Standard preprocessing configuration"

# Get specific preprocessing options by session ID
@app.get("/preprocessing-options/{session_id}")
def get_preprocessing_option_by_id(session_id: str):
    """Get specific preprocessing options by session ID"""
    try:
        user_sessions_dir = "user_sessions"
        session_path = os.path.join(user_sessions_dir, session_id)
        
        if not os.path.exists(session_path):
            raise HTTPException(status_code=404, detail="Session not found")
        
        preprocessing_file = os.path.join(session_path, "preprocessing_options.json")
        
        if not os.path.exists(preprocessing_file):
            raise HTTPException(status_code=404, detail="Preprocessing options not found for this session")
        
        with open(preprocessing_file, 'r', encoding='utf-8') as f:
            options_data = json.load(f)
        
        # Get additional session metadata
        file_stats = os.stat(preprocessing_file)
        created_date = datetime.fromtimestamp(file_stats.st_ctime)
        
        # Extract original file name if available
        original_file_name = "Unknown dataset"
        for file in os.listdir(session_path):
            if file.startswith("original_"):
                original_file_name = file.replace("original_", "")
                break
        
        return {
            "sessionId": session_id,
            "name": generate_preprocessing_name(options_data, original_file_name),
            "description": generate_preprocessing_description(options_data),
            "options": options_data,
            "createdDate": created_date.isoformat(),
            "originalDataset": original_file_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting preprocessing options for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving preprocessing options: {str(e)}")

# Get available files from my_files directory instead of user sessions
@app.get("/session-files")
def get_session_files():
    """Get available files from my_files directory"""
    try:
        # Changed from user_sessions to my_files directory
        my_files_dir = "my_files"
        files = []
        
        if not os.path.exists(my_files_dir):
            return files
        
        # Scan through my_files directory
        for file in os.listdir(my_files_dir):
            file_path = os.path.join(my_files_dir, file)
            
            # Include only actual files (not directories) and skip README and .gitignore
            if os.path.isfile(file_path) and not file.startswith('.') and file.lower() != 'readme.md':
                
                try:
                    file_stats = os.stat(file_path)
                    file_size = file_stats.st_size
                    last_modified = datetime.fromtimestamp(file_stats.st_mtime)
                    
                    # Generate a unique ID for each file
                    file_id = f"my_files_{file}"
                    
                    file_info = {
                        "id": file_id,
                        "name": file,
                        "originalName": file,
                        "size": file_size,
                        "lastModified": last_modified.isoformat(),
                        "path": file_path,
                        "sessionId": "my_files",  # Use a fixed sessionId for compatibility
                        "fileType": "original",
                        "description": f"File disponibile da repository: {file}"
                    }
                    
                    files.append(file_info)
                    
                except Exception as e:
                    logger.warning(f"Error reading file {file_path}: {e}")
                    continue
        
        # Sort by filename for consistent ordering
        files.sort(key=lambda x: x["name"])
        
        logger.info(f"Found {len(files)} files in my_files directory")
        return files
        
    except Exception as e:
        logger.error(f"Error getting files from my_files directory: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving files: {str(e)}")

# COMMENTATO: Vecchio endpoint session-files che usava user_sessions
# @app.get("/session-files")
# def get_session_files():
#     """Get available files from all user sessions"""
#     try:
#         user_sessions_dir = "user_sessions"
#         files = []
#         
#         if not os.path.exists(user_sessions_dir):
#             return files
#         
#         # Scan through user session directories
#         for session_folder in os.listdir(user_sessions_dir):
#             session_path = os.path.join(user_sessions_dir, session_folder)
#             if os.path.isdir(session_path):
#                 
#                 # Look for original files only
#                 for file in os.listdir(session_path):
#                     file_path = os.path.join(session_path, file)
#                     
#                     # Include only original files
#                     if file.startswith("original_"):
#                         
#                         try:
#                             file_stats = os.stat(file_path)
#                             file_size = file_stats.st_size
#                             last_modified = datetime.fromtimestamp(file_stats.st_mtime)
#                             
#                             # Process original files
#                             display_name = file.replace("original_", "")
#                             file_type = "original"
#                             description = f"File originale da sessione {session_folder}"
#                             
#                             file_info = {
#                                 "id": f"{session_folder}_{file}",
#                                 "name": display_name,
#                                 "originalName": file,
#                                 "size": file_size,
#                                 "lastModified": last_modified.isoformat(),
#                                 "path": file_path,
#                                 "sessionId": session_folder,
#                                 "fileType": file_type,
#                                 "description": description
#                             }
#                             
#                             files.append(file_info)
#                             
#                         except Exception as e:
#                             logger.warning(f"Error reading file {file_path}: {e}")
#                             continue
#         
#         # Sort by last modified date (newest first)
#         files.sort(key=lambda x: x["lastModified"], reverse=True)
#         
#         logger.info(f"Found {len(files)} session files")
#         return files
#         
#     except Exception as e:
#         logger.error(f"Error getting session files: {e}")
#         raise HTTPException(status_code=500, detail=f"Error retrieving session files: {str(e)}")

# Get specific file content from my_files directory
@app.get("/session-files/{session_id}/{filename}")
def get_session_file(session_id: str, filename: str):
    """Get specific file content from my_files directory or user sessions (for compatibility)"""
    try:
        # If session_id is "my_files", serve from my_files directory
        if session_id == "my_files":
            my_files_dir = "my_files"
            file_path = os.path.join(my_files_dir, filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="File not found in my_files directory")
            
            # Security check: ensure file is within my_files directory
            if not os.path.abspath(file_path).startswith(os.path.abspath(my_files_dir)):
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Return file as response
            return FileResponse(
                file_path,
                media_type='application/octet-stream',
                filename=filename
            )
        
        # COMMENTATO: Serving legacy user_sessions files (mantenuto per compatibilità con ripristino analisi esistenti)
        # Per compatibilità con funzionalità di ripristino analisi esistenti che potrebbero ancora riferirsi a user_sessions
        else:
            user_sessions_dir = "user_sessions"
            session_path = os.path.join(user_sessions_dir, session_id)
            file_path = os.path.join(session_path, filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="File not found")
            
            # Security check: ensure file is within session directory
            if not os.path.abspath(file_path).startswith(os.path.abspath(session_path)):
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Return file as response
            return FileResponse(
                file_path,
                media_type='application/octet-stream',
                filename=filename
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting file {session_id}/{filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving file: {str(e)}")

# Global exception handlers for validation
@app.exception_handler(ValidationError)
async def validation_exception_handler(request, exc: ValidationError):
    """Handle Pydantic validation errors globally"""
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation Error",
            "errors": exc.errors(),
            "message": "Invalid input data. Please check your request parameters."
        }
    )

@app.exception_handler(ValueError)
async def value_error_handler(request, exc: ValueError):
    """Handle value errors from validation"""
    return JSONResponse(
        status_code=400,
        content={
            "detail": "Invalid Value",
            "message": str(exc)
        }
    )

if __name__ == "__main__":
    import uvicorn
    import socket
    
    def find_free_port(start_port=8000, max_attempts=10):
        """Trova una porta libera partendo da start_port"""
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
