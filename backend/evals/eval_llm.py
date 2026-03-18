"""
Eval suite for LLM analysis quality.

Run with: python -m evals.eval_llm [path_to_bundle.tar.gz]

Requires OPENAI_API_KEY to be set.
Optionally logs results to LangFuse if configured.
"""

import json
import re
import shutil
import sys

from openai import OpenAI

from analyzer.scanner import scan_bundle
from analyzer.analyzer import (
    _build_file_context,
    _format_rule_findings,
)
from config import settings
from evals.eval_config import (
    EXPECTED_KEYWORDS_IN_LLM,
    EXPECTED_LLM_SECTIONS,
    EXPECTED_OOM_KEYWORDS,
    create_synthetic_bundle,
    extract_bundle_to_temp,
)
from observability import get_langfuse


# ---------------------------------------------------------------------------
# Prompt builder (mirrors analyzer.py but without DB / embedding calls)
# ---------------------------------------------------------------------------

def _build_prompt(extracted_path: str, rule_findings: dict) -> str:
    """Build the same analysis prompt used by the production analyzer."""
    file_context = _build_file_context(extracted_path)
    findings_text = _format_rule_findings(rule_findings)

    return f"""You are an expert Kubernetes support engineer analyzing a support bundle.

## Rule-based findings (automated scan):
{findings_text}

## Relevant cluster state and logs:
{file_context}

## Similar past incidents:
No previous incidents found.

Analyze this support bundle and respond using valid Markdown with proper heading syntax.
You MUST use ## and ### prefixes for headings. Do NOT output headings as plain text.

Use this EXACT format (note the ## and ### prefixes are required):

SEVERITY: critical/warning/info

## Summary
[2-3 sentence overview of what's wrong]

## Findings

### [Issue Name]
- **Status**: [What's happening]
- **Evidence**: [Specific log lines or state that proves this]
- **Confidence**: [High/Medium/Low]
- **Affected Resources**: [Pod names, namespaces, etc.]

### [Next Issue Name]
[Same format as above, repeat for each issue]

## Root Cause Analysis
[What's actually causing these issues and how they relate]

## Recommended Actions
1. [First action — most urgent]
2. [Second action]
3. [Third action]
4. [Additional actions as needed]"""


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def check_structure(output: str) -> tuple[bool, str]:
    """Check that the output contains the expected Markdown sections."""
    missing = []
    for section in EXPECTED_LLM_SECTIONS:
        if section not in output:
            missing.append(section)
    if missing:
        return False, f"Missing sections: {', '.join(missing)}"
    return True, "All expected sections present"


def check_severity(output: str) -> tuple[bool, str]:
    """Check that the output begins with SEVERITY: critical."""
    match = re.search(r"SEVERITY:\s*(critical|warning|info)", output[:300], re.IGNORECASE)
    if not match:
        return False, "No SEVERITY line found in the first 300 chars"
    severity = match.group(1).lower()
    if severity == "critical":
        return True, "Severity correctly identified as critical"
    return False, f"Expected severity 'critical', got '{severity}'"


def check_detection(output: str, is_synthetic: bool = False) -> tuple[bool, str]:
    """Check that the output mentions expected failure keywords.

    For real bundles: only check CrashLoopBackOff and ImagePullBackOff (OOMKilled
    may not be explicitly present in the bundle data).
    For synthetic bundles: also check for OOMKilled/RunContainerError.
    """
    missing = []
    for keyword in EXPECTED_KEYWORDS_IN_LLM:
        if keyword not in output:
            missing.append(keyword)

    # OOM keywords only required for synthetic bundles where we know they exist
    if is_synthetic:
        has_oom = any(kw in output for kw in EXPECTED_OOM_KEYWORDS)
        if not has_oom:
            missing.append("OOMKilled/RunContainerError")

    if missing:
        return False, f"Missing keywords: {', '.join(missing)}"
    return True, "All expected failure modes detected"


def check_evidence(output: str) -> tuple[bool, str]:
    """Check that the output references specific pod names or namespaces."""
    # Look for pod-name-like patterns (word-hash-hash) or the literal pod names
    pod_patterns = [
        r"crasher[-\w]*",
        r"bad-image[-\w]*",
        r"oom-demo[-\w]*",
        r"namespace",
        r"default",  # namespace name
    ]
    found = []
    for pat in pod_patterns:
        if re.search(pat, output, re.IGNORECASE):
            found.append(pat)

    # Need at least 2 specific references
    if len(found) >= 2:
        return True, f"Found {len(found)} evidence references"
    return False, f"Only found {len(found)} evidence references (need >= 2)"


def check_actionability(output: str) -> tuple[bool, str]:
    """Check that recommendations include specific fixes, not just generic advice."""
    action_indicators = [
        r"(set|increase|decrease|change|update|configure|add|remove|replace|fix|use|specify)\s",
        r"(memory|image|limit|request|resource|tag|registry|repository|container)\b",
        r"kubectl\b",
        r"(yaml|manifest|deployment|spec)\b",
    ]
    matches = 0
    for pat in action_indicators:
        if re.search(pat, output, re.IGNORECASE):
            matches += 1

    if matches >= 3:
        return True, f"Found {matches} actionability indicators"
    return False, f"Only found {matches} actionability indicators (need >= 3)"


# ---------------------------------------------------------------------------
# LLM-as-judge
# ---------------------------------------------------------------------------

def llm_judge(client: OpenAI, analysis_output: str, is_synthetic: bool = False) -> dict[str, int]:
    """
    Use a second GPT-4o call to score the analysis on four dimensions.
    Returns a dict mapping dimension name to a 1-10 integer score.
    """
    if is_synthetic:
        ground_truth = """The cluster has three intentional failures:
1. A pod called "bad-image" with ImagePullBackOff (fake image that doesn't exist)
2. A pod called "crasher" with CrashLoopBackOff (container that immediately exits)
3. A pod called "oom-demo" with RunContainerError / OOMKilled (container with 1Mi memory limit)"""
    else:
        ground_truth = """The cluster has the following known issues visible in the bundle data:
1. A pod called "bad-image" with ImagePullBackOff / ErrImagePull (invalid image tag "nginx:this-tag-does-not-exist")
2. A pod called "crasher" with CrashLoopBackOff (container that immediately exits with error)
3. A pod called "oom-demo" showing CrashLoopBackOff with exit code 128 (memory-constrained container)
4. Node readiness issues (ContainersNotReady) and FailedScheduling events across namespaces
Note: The oom-demo pod does NOT show explicit "OOMKilled" in the bundle — it only shows CrashLoopBackOff with exit code 128. A good analysis would note the exit code but should NOT claim OOMKilled if it's not in the evidence."""

    judge_prompt = f"""You are evaluating a Kubernetes support bundle analysis written by an AI assistant.

{ground_truth}

Here is the analysis to evaluate:

---
{analysis_output}
---

Score the analysis on each of the following dimensions from 1 to 10.
Respond ONLY with valid JSON, no other text. Use this exact format:
{{"accuracy": <int>, "completeness": <int>, "actionability": <int>, "clarity": <int>}}

Scoring criteria:
- accuracy: Are the claims factually correct based on the evidence? Does it avoid hallucinating issues not present in the data? (10 = perfectly accurate, no hallucinations)
- completeness: Does it identify all the key issues listed above? Does it provide root cause analysis? (10 = all issues covered with root cause)
- actionability: Are the recommended actions specific, prioritized, and directly address the identified issues? (10 = specific kubectl commands or config changes, not generic advice)
- clarity: Is the analysis well-structured with clear sections, evidence citations, and easy to follow? (10 = perfectly organized, every claim backed by evidence)"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": judge_prompt}],
        temperature=0.0,
        max_tokens=200,
    )

    raw = response.choices[0].message.content.strip()
    # Extract JSON even if wrapped in markdown code fences
    json_match = re.search(r"\{[^}]+\}", raw)
    if not json_match:
        print(f"  WARNING: Could not parse judge response: {raw}")
        return {"accuracy": 0, "completeness": 0, "actionability": 0, "clarity": 0}

    try:
        scores = json.loads(json_match.group())
        # Validate values
        for key in ("accuracy", "completeness", "actionability", "clarity"):
            val = scores.get(key, 0)
            scores[key] = max(1, min(10, int(val)))
        return scores
    except (json.JSONDecodeError, ValueError) as exc:
        print(f"  WARNING: Could not parse judge scores: {exc}")
        return {"accuracy": 0, "completeness": 0, "actionability": 0, "clarity": 0}


# ---------------------------------------------------------------------------
# Main eval runner
# ---------------------------------------------------------------------------

def _run_eval(extracted_path: str, is_synthetic: bool = False) -> bool:
    """Run the full LLM eval. Returns True if core checks pass."""
    if not settings.OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY is not set. Cannot run LLM eval.")
        return False

    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    # 1. Scan the bundle
    print("Running rule scanner...")
    rule_findings = scan_bundle(extracted_path)
    print(f"  Found {len(rule_findings['findings'])} rule findings")

    # 2. Build prompt and call GPT-4o (non-streaming)
    print("Building prompt...")
    prompt = _build_prompt(extracted_path, rule_findings)
    print(f"  Prompt length: {len(prompt)} chars")

    print("Calling GPT-4o (non-streaming)...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4096,
    )
    analysis = response.choices[0].message.content
    usage = response.usage
    print(f"  Response length: {len(analysis)} chars")
    if usage:
        print(f"  Tokens — prompt: {usage.prompt_tokens}, completion: {usage.completion_tokens}")

    # 3. Run checks
    checks: list[tuple[str, bool, str]] = []

    label, passed, detail = "Structure check", *check_structure(analysis)
    checks.append((label, passed, detail))

    label, passed, detail = "Severity check", *check_severity(analysis)
    checks.append((label, passed, detail))

    label, passed, detail = "Detection check", *check_detection(analysis, is_synthetic=is_synthetic)
    checks.append((label, passed, detail))

    label, passed, detail = "Evidence check", *check_evidence(analysis)
    checks.append((label, passed, detail))

    label, passed, detail = "Actionability check", *check_actionability(analysis)
    checks.append((label, passed, detail))

    # 4. LLM-as-judge
    print("Running LLM-as-judge scoring...")
    judge_scores = llm_judge(client, analysis, is_synthetic=is_synthetic)

    # 5. Log to LangFuse if configured
    langfuse = get_langfuse()
    if langfuse:
        try:
            trace = langfuse.trace(
                name="eval-llm-analysis",
                tags=["eval"],
                metadata={
                    "rule_findings_count": len(rule_findings.get("findings", [])),
                    "prompt_length": len(prompt),
                    "response_length": len(analysis),
                },
            )
            generation = trace.generation(
                name="gpt4o-eval",
                model="gpt-4o",
                input={"prompt": prompt[:500] + "..."},
                output=analysis[:1000] + "...",
                metadata={
                    "prompt_tokens": usage.prompt_tokens if usage else None,
                    "completion_tokens": usage.completion_tokens if usage else None,
                },
            )
            generation.end()

            # Log individual check results as scores
            for label, passed, detail in checks:
                trace.score(
                    name=label.lower().replace(" ", "_"),
                    value=1.0 if passed else 0.0,
                    comment=detail,
                )

            # Log judge scores
            for dimension, score in judge_scores.items():
                trace.score(
                    name=f"judge_{dimension}",
                    value=float(score),
                    comment=f"LLM-as-judge {dimension} score",
                )

            langfuse.flush()
            print("  Results logged to LangFuse")
        except Exception as exc:
            print(f"  WARNING: Failed to log to LangFuse: {exc}")
    else:
        print("  LangFuse not configured, skipping observability logging")

    # ---- Scorecard -----------------------------------------------------------
    print("\n" + "=" * 60)
    print("LLM EVAL SCORECARD")
    print("=" * 60)

    print("\nCore checks:")
    all_pass = True
    for label, passed, detail in checks:
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {label}: {detail}")
        if not passed:
            all_pass = False

    print("\nLLM-as-judge scores (1-10):")
    for dimension, score in judge_scores.items():
        bar = "#" * score + "." * (10 - score)
        print(f"  {dimension:15s}: {score:2d}/10  [{bar}]")

    avg_score = sum(judge_scores.values()) / max(len(judge_scores), 1)
    print(f"\n  Average judge score: {avg_score:.1f}/10")

    print("\n" + "-" * 60)
    if all_pass:
        print("RESULT: ALL CORE CHECKS PASSED")
    else:
        print("RESULT: SOME CORE CHECKS FAILED")
    print("=" * 60 + "\n")

    return all_pass


def main() -> int:
    bundle_path = sys.argv[1] if len(sys.argv) > 1 else None
    cleanup_path = None

    try:
        is_synthetic = False
        if bundle_path:
            print(f"Using real bundle: {bundle_path}")
            extracted = extract_bundle_to_temp(bundle_path)
        else:
            print("No bundle path provided — using synthetic bundle")
            extracted = create_synthetic_bundle()
            cleanup_path = extracted
            is_synthetic = True

        all_pass = _run_eval(extracted, is_synthetic=is_synthetic)
        return 0 if all_pass else 1

    finally:
        if cleanup_path:
            shutil.rmtree(cleanup_path, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
