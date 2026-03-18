"""
Eval suite for the rule-based scanner.

Run with: python -m evals.eval_scanner [path_to_bundle.tar.gz]

If no bundle path provided, uses a synthetic test bundle.
"""

import shutil
import sys
from collections import Counter

from analyzer.scanner import scan_bundle
from evals.eval_config import (
    EXPECTED_RULES,
    create_synthetic_bundle,
    extract_bundle_to_temp,
)


def _run_eval(extracted_path: str) -> bool:
    """Run scanner eval against an extracted bundle. Returns True if all checks pass."""
    results = scan_bundle(extracted_path)
    findings = results["findings"]

    # Collect rule names and severities
    found_rules: set[str] = set()
    severity_counts: Counter[str] = Counter()
    for f in findings:
        found_rules.add(f["rule"])
        severity_counts[f["severity"]] += 1

    # ---- Assertions ----------------------------------------------------------
    checks: list[tuple[str, bool]] = []

    # 1. At least one CrashLoopBackOff finding
    has_crash = "CrashLoopBackOff" in found_rules
    checks.append(("CrashLoopBackOff finding present", has_crash))

    # 2. At least one ImagePullBackOff or ErrImagePull finding
    has_image_pull = "ImagePullBackOff" in found_rules
    checks.append(("ImagePullBackOff/ErrImagePull finding present", has_image_pull))

    # 3. At least one critical severity finding
    has_critical = severity_counts.get("critical", 0) > 0
    checks.append(("At least one critical finding", has_critical))

    # ---- Scorecard -----------------------------------------------------------
    print("\n" + "=" * 60)
    print("SCANNER EVAL SCORECARD")
    print("=" * 60)

    print(f"\nTotal findings: {len(findings)}")
    print(f"Scanned files:  {results['scanned_files']} / {results['total_files']}")

    print("\nFindings by severity:")
    for sev in ("critical", "warning", "info"):
        count = severity_counts.get(sev, 0)
        print(f"  {sev:10s}: {count}")

    print("\nExpected rules:")
    for rule_name in EXPECTED_RULES:
        status = "FOUND" if rule_name in found_rules else "MISSING"
        print(f"  {rule_name:25s}: {status}")

    other_rules = found_rules - set(EXPECTED_RULES)
    if other_rules:
        print("\nAdditional rules found:")
        for rule_name in sorted(other_rules):
            print(f"  {rule_name}")

    print("\nAssertion results:")
    all_pass = True
    for label, passed in checks:
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {label}")
        if not passed:
            all_pass = False

    print("\n" + "-" * 60)
    if all_pass:
        print("RESULT: ALL CHECKS PASSED")
    else:
        print("RESULT: SOME CHECKS FAILED")
    print("=" * 60 + "\n")

    return all_pass


def main() -> int:
    bundle_path = sys.argv[1] if len(sys.argv) > 1 else None
    cleanup_path: str | None = None

    try:
        if bundle_path:
            print(f"Using real bundle: {bundle_path}")
            extracted = extract_bundle_to_temp(bundle_path)
        else:
            print("No bundle path provided — using synthetic bundle")
            extracted = create_synthetic_bundle()
            cleanup_path = extracted

        all_pass = _run_eval(extracted)
        return 0 if all_pass else 1

    finally:
        # Clean up only synthetic bundles; real ones use a temp dir from extractor
        if cleanup_path:
            shutil.rmtree(cleanup_path, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
