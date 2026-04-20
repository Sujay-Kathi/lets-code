import sys
import subprocess
import argparse
import tempfile
import os

def run_python(code: str, timeout: int = 2):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        temp_path = f.name
        
    try:
        # Run python code
        result = subprocess.run(
            ["python", temp_path],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Execution timed out",
            "exit_code": 124
        }
    finally:
        os.remove(temp_path)

def run_c(code: str, timeout: int = 2):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".c", delete=False) as f:
        f.write(code)
        temp_path = f.name
        
    out_path = temp_path[:-2] # remove .c
    
    try:
        # Compile
        compile_res = subprocess.run(
            ["gcc", temp_path, "-o", out_path],
            capture_output=True,
            text=True
        )
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": "Compilation Error:\n" + compile_res.stderr,
                "exit_code": compile_res.returncode
            }
            
        # Run
        result = subprocess.run(
            [out_path],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Execution timed out",
            "exit_code": 124
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        if os.path.exists(out_path):
            os.remove(out_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", required=True, choices=["python", "c"])
    args = parser.parse_args()

    # Read code from stdin
    code = sys.stdin.read()
    
    if args.language == "python":
        res = run_python(code)
    else:
        res = run_c(code)
        
    # Output result as JSON or simple structured text
    # We will just print stdout if success, else stderr
    if res["exit_code"] == 0:
        print(res["stdout"], end="")
    else:
        print(res["stderr"], file=sys.stderr, end="")
        sys.exit(res["exit_code"])
