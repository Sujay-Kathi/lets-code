"""
AI-powered code evaluation using NVIDIA NIM.

Uses the OpenAI-compatible NIM API to judge whether a student's code
produces correct output for a given problem statement and input.
"""

import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

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
    baseline_output: str,
    student_code: str,
    student_input: str,
    student_output: str,
    language: str,
    max_points: int,
) -> dict:
    """
    Use NVIDIA NIM to perform a deep logic comparison between a student's code
    and the authoritative teacher baseline.

    Args:
        problem_description: Full problem statement.
        baseline_code: Authoritative code finalized by the teacher.
        baseline_output: Compiled output from the teacher's baseline.
        student_code: Submitted code by the student.
        student_input: Stdin input provided.
        student_output: Compiled output from the student's submission.
        language: Programming language.
        max_points: Maximum points.

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

## Authoritative Baseline Compiled Output:
{baseline_output if baseline_output else "(no output)"}

## Student's Submitted Code ({language}):
```{language}
{student_code}
```

## Student's Stdin Input:
{student_input if student_input else "(no input)"}

## Student's Compiled Output:
{student_output if student_output else "(no output)"}

## Evaluation Rules:
1. Deeply analyze the conceptual algorithmic logic of both the teacher's baseline code and the student's submitted code.
2. If the logic of compilation and the core conceptual logic match the intended problem behavior, grant full points.
3. If the actual compiled outputs match exactly, that confirms correctness. However, if the outputs differ slightly due to custom print formats, extra newline characters, or different intermediate debug messages, but the underlying logic is perfectly sound and equivalent to the baseline, mark as CORRECT.
4. If the student's logic fundamentally diverges from the correct solution or contains unexpected exceptions/errors, mark as INCORRECT.

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
