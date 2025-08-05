import requests
import json

# Test the preprocessing endpoint
url = "http://localhost:8000/preprocess"

# Simple test options
import json
import requests
import uuid

# Generate a proper random sessionId
session_id = str(uuid.uuid4())

options = {
    "columnClassification": {
        "idColumn": 0,
        "outcomeColumn": 1,
        "covariateColumns": [2],  # Fixed: should be array
        "omicsColumns": [3, 4, 5],
        "categoricalColumns": [2]  # Fixed: should be array
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

# Prepare the multipart form data
files = {
    'file': ('test_data.csv', open('test_data.csv', 'rb'), 'text/csv')
}

data = {
    'options': json.dumps(options),
    'userId': 'MasterTest',
    'sessionId': session_id
}

print("JSON being sent:")
print(json.dumps(options, indent=2))
print(f"Using sessionId: {session_id}")
print(f"Using userId: MasterTest")
print("\nActual options string:")
print(data['options'])

try:
    print("Sending preprocessing request...")
    response = requests.post(url, files=files, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {response.headers}")
    
    if response.status_code == 200:
        print("Success! Response content type:", response.headers.get('content-type'))
        # Save the response as a file if it's a blob
        with open('processed_response.csv', 'wb') as f:
            f.write(response.content)
        print("Response saved as processed_response.csv")
    else:
        print(f"Error: {response.status_code}")
        print("Response text:")
        print(response.text)
        
except Exception as e:
    print(f"Exception occurred: {e}")

finally:
    files['file'][1].close()  # Close the file
