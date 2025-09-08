#!/usr/bin/env python3
"""
Test script to verify that the new my_files endpoint works correctly
"""

import requests
import json

def test_my_files_endpoint():
    """Test the /session-files endpoint to verify it returns files from my_files directory"""
    
    # Test the API endpoint
    url = "http://localhost:8000/session-files"
    
    try:
        print("Testing /session-files endpoint...")
        response = requests.get(url)
        
        if response.status_code == 200:
            files = response.json()
            print(f"✅ Success! Found {len(files)} files:")
            
            for file in files:
                print(f"  📄 {file['name']}")
                print(f"     Size: {file['size']} bytes")
                print(f"     SessionId: {file['sessionId']}")
                print(f"     Description: {file['description']}")
                print(f"     Path: {file['path']}")
                print()
                
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to FastAPI server. Make sure it's running on localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_my_files_endpoint()
