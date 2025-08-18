#!/usr/bin/env python3
"""
Simple test to verify the Windows-compatible FastAPI server works
"""

import asyncio
import platform

async def test_windows_subprocess():
    """Test if Windows subprocess execution works"""
    
    print(f"Platform: {platform.system()}")
    print(f"Python version: {platform.python_version()}")
    
    if platform.system() == "Windows":
        # Set Windows event loop policy
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        print("Set Windows ProactorEventLoopPolicy")
    
    try:
        # Test basic subprocess execution
        if platform.system() == "Windows":
            import subprocess
            
            def run_test_sync():
                result = subprocess.run(
                    ["python", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                return result
            
            result = await asyncio.to_thread(run_test_sync)
            print(f"Subprocess test successful: {result.stdout.strip()}")
            
        else:
            # Unix/Linux test
            result = await asyncio.create_subprocess_exec(
                "python", "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            print(f"Subprocess test successful: {stdout.decode().strip()}")
            
        return True
        
    except Exception as e:
        print(f"Subprocess test failed: {e}")
        return False

async def main():
    success = await test_windows_subprocess()
    if success:
        print("✅ Windows subprocess compatibility test passed")
    else:
        print("❌ Windows subprocess compatibility test failed")

if __name__ == "__main__":
    asyncio.run(main())
