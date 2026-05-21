"""
AI-powered code evaluation using NVIDIA NIM.

Uses the OpenAI-compatible NIM API to judge whether a student's code
produces correct output for a given problem statement and input.
"""

import os
import json
import logging
from pathlib import Path
from openai import OpenAI

logger = logging.getLogger(__name__)

# Load .env file as fallback if env vars aren't already set
def _load_dotenv_fallback():
    """Load environment variables from .env file if not already present."""
    if os.getenv("NVIDIA_API_KEY"):
        return  # Already set, no need for fallback
    env_paths = [
        Path(__file__).parent.parent / ".env",  # project root
        Path(__file__).parent / ".env",          # backend dir
    ]
    for env_path in env_paths:
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, val = line.partition("=")
                        key, val = key.strip(), val.strip()
                        if not os.getenv(key):
                            os.environ[key] = val
            logger.info(f"Loaded env fallback from {env_path}")
            break

_load_dotenv_fallback()

# NVIDIA NIM Configuration
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NIM_BASE_URL = os.getenv("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct")


def get_nim_client() -> OpenAI:
    """Create an OpenAI-compatible client pointing to NVIDIA NIM."""
    if not NVIDIA_API_KEY:
        raise ValueError("NVIDIA_API_KEY environment variable is not set")
    return OpenAI(base_url=NIM_BASE_URL, api_key=NVIDIA_API_KEY)


def evaluate_with_ai(
    problem_description: str,
    student_code: str,
    user_input: str,
    actual_output: str,
    language: str,
    max_points: int,
) -> dict:
    """
    Use NVIDIA NIM to evaluate whether the student's code output is correct.

    Args:
        problem_description: The full problem statement / question description.
        student_code: The code the student submitted.
        user_input: The stdin input the student provided (can be empty).
        actual_output: The stdout/stderr captured from running the code.
        language: Programming language (python, c, etc.).
        max_points: Maximum points for this question.

    Returns:
        dict with keys:
            - is_correct (bool): Whether the output is correct.
            - score (int): Points awarded (0 to max_points).
            - reasoning (str): Brief explanation of the verdict.
    """
    raw = ""
    try:
        client = get_nim_client()

        prompt = f"""You are a strict but fair code evaluator for a programming quiz platform.

## Problem Statement:
{problem_description}

## Student's Code ({language}):
```{language}
{student_code}
```

## Input Provided by Student:
{user_input if user_input else "(no input)"}

## Actual Output from Compiler/Interpreter:
{actual_output if actual_output else "(no output)"}

## Evaluation Rules:
1. Check if the code correctly solves the problem described above.
2. Verify the output matches what is expected for the given input.
3. Check if the code handles the core logic correctly (not just this one input).
4. If the output contains an error/exception that the problem REQUIRES (e.g., the problem asks to raise an error for invalid input), that counts as CORRECT.
5. Minor formatting differences (extra spaces, trailing newlines) should NOT cause a failure.
6. If the code has a runtime error that is NOT expected by the problem, mark as INCORRECT.

## Response:
Respond ONLY with valid JSON, no markdown, no extra text:
{{
    "is_correct": true or false,
    "score": 0 to {max_points},
    "reasoning": "one-line explanation"
}}"""

        response = client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise code evaluator. Respond ONLY with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=256,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        result = json.loads(raw)

        return {
            "is_correct": bool(result.get("is_correct", False)),
            "score": min(int(result.get("score", 0)), max_points),
            "reasoning": str(result.get("reasoning", "No reasoning provided")),
        }

    except json.JSONDecodeError as e:
        logger.error(f"AI returned invalid JSON: {e}")
        return {
            "is_correct": False,
            "score": 0,
            "reasoning": f"AI evaluation parse error — falling back. Raw: {raw[:200]}",
        }
    except ValueError as e:
        logger.error(f"AI evaluator config error: {e}")
        return {
            "is_correct": False,
            "score": 0,
            "reasoning": f"AI evaluator not configured: {e}",
        }
    except Exception as e:
        logger.error(f"AI evaluation failed: {e}")
        return {
            "is_correct": False,
            "score": 0,
            "reasoning": f"AI evaluation unavailable: {e}",
        }


def evaluate_against_baseline(
    problem_description: str,
    baseline_code: str,
    baseline_input: str,
    baseline_output: str,
    student_code: str,
    student_input: str,
    student_output: str,
    language: str,
    max_points: int,
    student_output_on_baseline_input: str = "",
    baseline_output_on_student_input: str = "",
) -> dict:
    """
    Use NVIDIA NIM to perform a deep logic comparison between a student's code
    and the authoritative teacher baseline.

    Args:
        problem_description: Full problem statement.
        baseline_code: Authoritative code finalized by the teacher.
        baseline_input: Stdin test input used by the teacher.
        baseline_output: Compiled output from the teacher's baseline.
        student_code: Submitted code by the student.
        student_input: Stdin input provided.
        student_output: Compiled output from the student's submission.
        language: Programming language.
        max_points: Maximum points.
        student_output_on_baseline_input: Student output on baseline input.
        baseline_output_on_student_input: Baseline output on student input.

    Returns:
        dict containing is_correct, score, and reasoning.
    """
    raw = ""
    try:
        client = get_nim_client()

        prompt = f"""You are an expert code evaluator comparing a student's submission against an authoritative teacher baseline for a programming quiz platform.

## Problem Statement:
{problem_description}

## Authoritative Teacher Baseline Code ({language}):
```{language}
{baseline_code}
```

## Student's Submitted Code ({language}):
```{language}
{student_code}
```

## Comparative Test Runs (Same Inputs on Both Implementations):

### Test Case 1 (Baseline Input):
- Input Used: {baseline_input if baseline_input else "(no input)"}
- Teacher's Output: {baseline_output if baseline_output else "(no output)"}
- Student's Output on this Input: {student_output_on_baseline_input if student_output_on_baseline_input else "(no output)"}

### Test Case 2 (Student Input):
- Input Used: {student_input if student_input else "(no input)"}
- Teacher's Output on this Input: {baseline_output_on_student_input if baseline_output_on_student_input else "(no output)"}
- Student's Output: {student_output if student_output else "(no output)"}

## Evaluation Rules:
1. Deeply analyze the conceptual algorithmic logic of both the teacher's baseline code and the student's submitted code.
2. Focus strictly on functional correctness and logical equivalence.
3. If the student's outputs match the teacher's outputs for the same inputs (Test Case 1 and Test Case 2), the code is functionally correct.
4. Do NOT penalize for cosmetic differences. This includes:
   - Variable names or function parameter naming differences (e.g. `x, y` vs `a, b`).
   - Minor formatting/spacing/newline differences.
   - Slightly different text in descriptive prompts or error prefixes (e.g. print statements like `Enter value of a: ` vs standard inputs).
   - Differences in caught exception/error strings (e.g., student prints `Error:` while teacher prints `Error: Division by zero is not allowed!`). As long as both catch the same exception class and print/handle an error state appropriately, it is considered LOGICALLY equivalent and correct.
5. If the logic is sound and the results represent the correct execution flow and math/logic, award the maximum points ({max_points}).
6. Only award less points if there is a real logical error, wrong output values, or unhandled exceptions that break functional requirements.

Respond ONLY with valid JSON, no markdown fences, no extra text:
{{
    "is_correct": true or false,
    "score": 0 to {max_points},
    "reasoning": "concise explanation comparing student logic with baseline logic"
}}"""

        response = client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise code evaluator comparing against baselines. Respond ONLY with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=256,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        result = json.loads(raw)

        return {
            "is_correct": bool(result.get("is_correct", False)),
            "score": min(int(result.get("score", 0)), max_points),
            "reasoning": str(result.get("reasoning", "No reasoning provided")),
        }

    except json.JSONDecodeError as e:
        logger.error(f"AI returned invalid JSON: {e}")
        return {
            "is_correct": False,
            "score": 0,
            "reasoning": f"AI baseline evaluation parse error — falling back. Raw: {raw[:200]}",
        }
    except Exception as e:
        logger.error(f"AI baseline evaluation failed: {e}")
        return {
            "is_correct": False,
            "score": 0,
            "reasoning": f"AI baseline evaluation unavailable: {e}",
        }
