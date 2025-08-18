import asyncio
import json
import tempfile
import os
import traceback

async def test_direct_fastapi_call():
    """Test the exact same call that FastAPI makes"""
    
    # Create the same arguments that FastAPI would create
    session_dir = r"C:\Users\caros\Documents\test_angular_r_api\data-analysis-dashboard\user_sessions\MasterTest_test123"
    os.makedirs(session_dir, exist_ok=True)
    
    input_file_path = os.path.join(session_dir, "original_test_data.csv")
    
    # Copy test data to session directory
    import shutil
    shutil.copy2("test_data.csv", input_file_path)
    
    args = {
        "input_file": input_file_path,
        "output_dir": session_dir,
        "options": {
            "columnClassification": {
                "idColumn": 0,
                "outcomeColumn": 1,
                "covariateColumns": [2],
                "omicsColumns": [3, 4, 5],
                "categoricalColumns": [2]
            },
            "removeNullValues": False,
            "fillMissingValues": "none",
            "transformation": "none",
            "removeOutliers": False,
            "outlierMethod": "iqr",
            "missingDataRemoval": {
                "enabled": False,
                "threshold": 50,
                "columnsToRemove": []
            }
        }
    }
    
    temp_args_file = None
    try:
        print("Creating temporary arguments file...")
        
        # Create a temporary file for arguments to avoid JSON escaping issues
        temp_args_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(args, temp_args_file, indent=2)
        temp_args_file.close()
        
        print(f"Temp args file: {temp_args_file.name}")
        
        # Get absolute path to R script
        project_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(project_dir, "preprocess.R")
        
        print(f"Script path: {script_path}")
        print(f"Script exists: {os.path.exists(script_path)}")
        
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"R script not found: {script_path}")
        
        print("Starting subprocess...")
        
        # Run R script with arguments file path
        result = await asyncio.create_subprocess_exec(
            "Rscript", script_path, temp_args_file.name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        print("Waiting for subprocess to complete...")
        
        timeout = 300
        stdout, stderr = await asyncio.wait_for(result.communicate(), timeout=timeout)
        
        print("Subprocess completed!")
        
        # Decode output with error handling
        try:
            stdout_text = stdout.decode('utf-8')
        except UnicodeDecodeError:
            stdout_text = stdout.decode('utf-8', errors='replace')
        
        try:
            stderr_text = stderr.decode('utf-8')
        except UnicodeDecodeError:
            stderr_text = stderr.decode('utf-8', errors='replace')
        
        print(f"Return code: {result.returncode}")
        print(f"STDOUT:\n{stdout_text}")
        print(f"STDERR:\n{stderr_text}")
        
        if result.returncode != 0:
            print(f"R script failed with return code {result.returncode}")
            return
        
        try:
            result_json = json.loads(stdout_text)
            print("Successfully parsed JSON result:")
            print(json.dumps(result_json, indent=2))
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON: {e}")
            print(f"Raw output: {stdout_text}")
        
    except Exception as e:
        print(f"Exception occurred: {e}")
        print("Full traceback:")
        traceback.print_exc()
    finally:
        # Cleanup temporary arguments file
        if temp_args_file and os.path.exists(temp_args_file.name):
            try:
                os.unlink(temp_args_file.name)
                print(f"Cleaned up temp file: {temp_args_file.name}")
            except Exception as e:
                print(f"Failed to cleanup temp args file: {e}")

if __name__ == "__main__":
    asyncio.run(test_direct_fastapi_call())
