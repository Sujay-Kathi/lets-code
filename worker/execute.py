import sys
import subprocess
import argparse
import tempfile
import os

def run_python(code: str, test_input: str, timeout: int = 2):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        temp_path = f.name
        
    try:
        # Run python code passing input via stdin
        result = subprocess.run(
            ["python", temp_path],
            input=test_input,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        stderr_out = result.stderr
        if "EOFError: EOF when reading a line" in stderr_out:
            stderr_out += "\n\n💡 [Sandbox Hint]: Your code called input() but the Standard Input Feed (Stdin buffer) was empty. Please type expected input values in the input pane below before running."
        return {
            "stdout": result.stdout,
            "stderr": stderr_out,
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

def run_c(code: str, test_input: str, timeout: int = 2):
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
            
        # Run passing input via stdin
        result = subprocess.run(
            [out_path],
            input=test_input,
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

    # Read payload from stdin
    raw_payload = sys.stdin.read()
    DELIMITER = "---END_OF_CODE_DELIMITER---"
    
    if DELIMITER in raw_payload:
        code, test_input = raw_payload.split(DELIMITER, 1)
        code = code.strip()
        # Remove carriage returns and strip leading newlines to ensure clean input streams
        test_input = test_input.replace("\r", "").lstrip("\n")
    else:
        code = raw_payload.strip()
        test_input = ""
    
    if args.language == "python":
        res = run_python(code, test_input)
    else:
        res = run_c(code, test_input)
        
    # Output result as simple structured text
    if res["exit_code"] == 0:
        print(res["stdout"], end="")
    else:
        print(res["stderr"], file=sys.stderr, end="")
        sys.exit(res["exit_code"])
