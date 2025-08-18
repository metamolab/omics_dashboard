#!/usr/bin/env python3
"""
Test script to verify data flow between fastapi_main.py and preprocess.R
This mimics exactly what fastapi_main.py does when calling the R script.
"""

import json
import tempfile
import subprocess
import os
import uuid
import asyncio

async def test_preprocess_data_flow():
    """Test the complete data flow between Python and R"""
    
    # Create test arguments exactly like fastapi_main.py does
    test_args = {
        "input_file": "test_input.csv",  # We'll create this
        "output_dir": "test_output",
        "options": {
            "userId": "MasterTest",
            "sessionId": str(uuid.uuid4()),
            "columnClassification": {
                "idColumn": 0,
                "outcomeColumn": 1,
                "covariateColumns": [2, 3],
                "omicsColumns": [4, 5, 6],
                "categoricalColumns": [2]
            },
            "missingDataRemoval": {
                "enabled": True,
                "threshold": 50
            },
            "removeOutliers": True,
            "outlierMethod": "iqr",
            "removeNullValues": False,
            "fillMissingValues": "mean",
            "transformation": "standardize",
            "analysisType": "classification"
        }
    }
    
    # Create a simple test CSV file
    test_csv_content = """id,outcome,cov1,cov2,omics1,omics2,omics3
1,0,25,M,1.2,2.3,3.4
2,1,30,F,1.5,2.8,3.9
3,0,35,M,1.1,2.1,3.2
4,1,28,F,1.7,2.9,4.1
5,0,32,M,1.3,2.4,3.5"""

    test_input_file = "test_input.csv"
    with open(test_input_file, 'w') as f:
        f.write(test_csv_content)
    
    # Update the input file path to absolute path
    test_args["input_file"] = os.path.abspath(test_input_file)
    test_args["output_dir"] = os.path.abspath("test_output")
    
    print("=== TESTING DATA FLOW ===")
    print(f"Test arguments:")
    print(json.dumps(test_args, indent=2))
    
    # Create temporary file for arguments (exactly like fastapi_main.py)
    temp_args_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json.dump(test_args, temp_args_file, indent=2)
    temp_args_file.close()
    
    print(f"\nTemporary args file: {temp_args_file.name}")
    
    try:
        # Run R script exactly like fastapi_main.py does
        script_path = "preprocess.R"
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"R script not found: {script_path}")
        
        print(f"\nRunning: Rscript {script_path} {temp_args_file.name}")
        
        result = await asyncio.create_subprocess_exec(
            "Rscript", script_path, temp_args_file.name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await result.communicate()
        
        # Decode output
        stdout_text = stdout.decode('utf-8', errors='replace')
        stderr_text = stderr.decode('utf-8', errors='replace')
        
        print(f"\n=== R SCRIPT OUTPUT ===")
        print(f"Return code: {result.returncode}")
        print(f"STDOUT:\n{stdout_text}")
        print(f"STDERR:\n{stderr_text}")
        
        if result.returncode == 0:
            try:
                parsed_result = json.loads(stdout_text)
                print(f"\n=== PARSED RESULT ===")
                print(json.dumps(parsed_result, indent=2))
                
                # Check if output file was created
                if parsed_result.get("success") and parsed_result.get("processed_file_path"):
                    output_file = parsed_result["processed_file_path"]
                    if os.path.exists(output_file):
                        print(f"\n✅ Output file created: {output_file}")
                        print(f"File size: {os.path.getsize(output_file)} bytes")
                    else:
                        print(f"\n❌ Output file not found: {output_file}")
                
            except json.JSONDecodeError as e:
                print(f"\n❌ Failed to parse JSON result: {e}")
                print(f"Raw output: {stdout_text}")
        else:
            print(f"\n❌ R script failed with return code {result.returncode}")
            
    except Exception as e:
        print(f"\n❌ Error running R script: {e}")
    
    finally:
        # Cleanup
        try:
            os.unlink(temp_args_file.name)
            if os.path.exists(test_input_file):
                os.unlink(test_input_file)
        except:
            pass

if __name__ == "__main__":
    asyncio.run(test_preprocess_data_flow())
