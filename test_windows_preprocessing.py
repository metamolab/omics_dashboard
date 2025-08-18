import requests
import json
import uuid

# Test the updated preprocessing endpoint
def test_windows_compatible_preprocessing():
    # Create test CSV data
    test_csv_content = """id,outcome,cov1,cov2,omics1,omics2,omics3
1,0,25,M,1.2,2.3,3.4
2,1,30,F,1.5,2.8,3.9
3,0,35,M,1.1,2.1,3.2
4,1,28,F,1.7,2.9,4.1
5,0,32,M,1.3,2.4,3.5"""

    # Create a temporary file-like object
    files = {
        'file': ('test_data.csv', test_csv_content, 'text/csv')
    }
    
    # Create preprocessing options
    preprocessing_options = {
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
    
    # Prepare form data
    data = {
        'options': json.dumps(preprocessing_options),
        'userId': 'MasterTest',
        'sessionId': str(uuid.uuid4())
    }
    
    try:
        print("Testing Windows-compatible preprocessing endpoint...")
        
        # Make the request
        response = requests.post(
            'http://localhost:8001/preprocess',
            files=files,
            data=data,
            timeout=60  # Increased timeout for Windows
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Windows-compatible preprocessing completed")
            print(f"Response content type: {response.headers.get('content-type')}")
            print(f"Response size: {len(response.content)} bytes")
        else:
            print("❌ ERROR: Preprocessing failed")
            print(f"Response text: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")

if __name__ == "__main__":
    test_windows_compatible_preprocessing()
