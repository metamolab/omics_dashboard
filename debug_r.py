import asyncio
import json
import tempfile
import os

async def test_r_subprocess():
    """Test R subprocess execution directly"""
    
    # Create test arguments
    args = {
        "input_file": "test_data.csv",
        "output_dir": "temp",
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
    
    # Create temp file for arguments
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
        json.dump(args, temp_file, indent=2)
        temp_file_path = temp_file.name
    
    try:
        print(f"Created temp args file: {temp_file_path}")
        print(f"Args content: {json.dumps(args, indent=2)}")
        
        # Get script path
        script_path = os.path.join(os.path.dirname(__file__), "preprocess.R")
        print(f"Script path: {script_path}")
        print(f"Script exists: {os.path.exists(script_path)}")
        
        # Run subprocess
        result = await asyncio.create_subprocess_exec(
            "Rscript", script_path, temp_file_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await result.communicate()
        
        print(f"Return code: {result.returncode}")
        print(f"STDOUT:\n{stdout.decode()}")
        print(f"STDERR:\n{stderr.decode()}")
        
    except Exception as e:
        print(f"Exception: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

if __name__ == "__main__":
    asyncio.run(test_r_subprocess())
