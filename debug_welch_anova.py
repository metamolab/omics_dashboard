import asyncio
import json
import tempfile
import os
import traceback

async def test_welch_anova_validation():
    """Test the analysis with welch-anova test"""
    
    # Create the same arguments that FastAPI would create for analysis
    session_dir = r"C:\Users\caros\Documents\test_angular_r_api\data-analysis-dashboard\user_sessions\MasterTest_test123"
    os.makedirs(session_dir, exist_ok=True)
    
    # Use the processed data from preprocessing as input for analysis
    processed_file_path = os.path.join(session_dir, "processed_data.csv")
    
    # If processed data doesn't exist, copy test data
    if not os.path.exists(processed_file_path):
        import shutil
        shutil.copy2("test_data.csv", processed_file_path)
    
    analysis_id = "MasterTest_test123"
    
    args = {
        "input_file": processed_file_path,
        "output_dir": session_dir,
        "analysis_id": analysis_id,
        "preprocessing_options": {
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
        },
        "analysis_options": {
            "sessionId": "test123",
            "userId": "MasterTest", 
            "groupingMethod": "tertiles",
            "thresholdValues": None,
            "statisticalTests": ["student-t", "welch-t", "welch-anova", "pearson", "spearman"],
            "linearRegression": True,
            "linearRegressionWithoutInfluentials": False,
            "multivariateAnalysis": {
                "ridge": {
                    "enabled": False,
                    "lambdaSelection": "automatic",
                    "lambdaRange": {
                        "min": 0.001,
                        "max": 1.0,
                        "step": 0.1
                    },
                    "metric": "rmse",
                    "lambdaRule": "min",
                    "includeCovariates": False
                },
                "lasso": {
                    "enabled": False,
                    "lambdaSelection": "automatic",
                    "lambdaRange": {
                        "min": 0.001,
                        "max": 1.0,
                        "step": 0.1
                    },
                    "metric": "rmse", 
                    "lambdaRule": "min",
                    "includeCovariates": False
                },
                "elasticNet": {
                    "enabled": False,
                    "lambdaSelection": "automatic",
                    "lambdaRange": {
                        "min": 0.001,
                        "max": 1.0,
                        "step": 0.1
                    },
                    "metric": "rmse",
                    "lambdaRule": "min",
                    "includeCovariates": False
                },
                "randomForest": {
                    "enabled": False,
                    "ntree": 100,
                    "mtrySelection": "automatic",
                    "mtryValue": 1,
                    "includeCovariates": False
                },
                "boruta": {
                    "enabled": False,
                    "ntree": 100,
                    "mtrySelection": "automatic",
                    "mtryValue": 1,
                    "maxRuns": 100,
                    "roughFixTentativeFeatures": False,
                    "includeCovariates": False
                },
                "rfe": {
                    "enabled": False,
                    "metric": "rmse",
                    "subsetSizeType": "automatic",
                    "customSubsetSizes": None,
                    "includeCovariates": False
                }
            },
            "clusteringMethod": None,
            "customAnalysis": None,
            "analysisType": "regression"
        }
    }
    
    # Test validation first
    try:
        import sys
        sys.path.append('.')
        from fastapi_main import AnalysisOptions
        
        validated = AnalysisOptions(**args["analysis_options"])
        print("✅ FastAPI validation passed with welch-anova!")
        print(f"Validated tests: {validated.statisticalTests}")
        
    except Exception as e:
        print(f"❌ FastAPI validation failed: {e}")
        return
    
    temp_args_file = None
    try:
        print("Creating temporary arguments file for welch-anova analysis...")
        
        # Create a temporary file for arguments
        temp_args_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(args, temp_args_file, indent=2)
        temp_args_file.close()
        
        print(f"Temp args file: {temp_args_file.name}")
        
        # Get absolute path to R script
        project_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(project_dir, "analysis.R")
        
        print(f"Script path: {script_path}")
        print(f"Script exists: {os.path.exists(script_path)}")
        
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"R script not found: {script_path}")
        
        print("Starting analysis subprocess with welch-anova...")
        
        # Run R script with arguments file path  
        result = await asyncio.create_subprocess_exec(
            "Rscript", script_path, temp_args_file.name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        print("Waiting for analysis subprocess to complete...")
        
        timeout = 600  # 10 minutes timeout for analysis
        stdout, stderr = await asyncio.wait_for(result.communicate(), timeout=timeout)
        
        print("Analysis subprocess completed!")
        
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
        if result.returncode != 0:
            print(f"STDERR:\n{stderr_text}")
            print(f"Analysis R script failed with return code {result.returncode}")
            return
        
        try:
            # Parse JSON result
            result_json = json.loads(stdout_text)
            print("✅ Successfully parsed analysis JSON result with welch-anova!")
            
            # Check if welch-anova results are present
            if 'welch-anova' in result_json.get('results', {}):
                print("✅ welch-anova results found in analysis output!")
                welch_results = result_json['results']['welch-anova']
                print(f"   Test name: {welch_results.get('testName', 'N/A')}")
                print(f"   Data points: {len(welch_results.get('data', []))}")
                print(f"   Summary: {welch_results.get('summary', {})}")
            else:
                print("ℹ️  welch-anova not found in results (may be because groupingMethod was tertiles)")
                print(f"Available results: {list(result_json.get('results', {}).keys())}")
            
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON: {e}")
            print(f"Raw output: {stdout_text[:1000]}...")  # First 1000 chars
    
    except Exception as e:
        print(f"Error running analysis: {e}")
        traceback.print_exc()
    
    finally:
        # Clean up temp file
        if temp_args_file and os.path.exists(temp_args_file.name):
            os.unlink(temp_args_file.name)
            print(f"Cleaned up temp file: {temp_args_file.name}")

if __name__ == "__main__":
    asyncio.run(test_welch_anova_validation())
