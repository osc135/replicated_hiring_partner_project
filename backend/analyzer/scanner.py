import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

RULES = [
    {"name": "CrashLoopBackOff", "pattern": "CrashLoopBackOff", "severity": "critical", "description": "Pod is crash-looping"},
    {"name": "OOMKilled", "pattern": "OOMKilled", "severity": "critical", "description": "Container killed due to memory limit"},
    {"name": "ImagePullBackOff", "pattern": "ImagePullBackOff|ErrImagePull", "severity": "critical", "description": "Cannot pull container image"},
    {"name": "RunContainerError", "pattern": "RunContainerError", "severity": "critical", "description": "Failed to start container"},
    {"name": "NodeNotReady", "pattern": "NodeNotReady|NotReady", "severity": "warning", "description": "Node is not ready"},
    {"name": "PodEvicted", "pattern": "Evicted", "severity": "warning", "description": "Pod was evicted"},
    {"name": "FailedScheduling", "pattern": "FailedScheduling", "severity": "warning", "description": "Pod could not be scheduled"},
    {"name": "FailedMount", "pattern": "FailedMount|MountVolume", "severity": "warning", "description": "Volume mount failed"},
    {"name": "BackoffPullImage", "pattern": "Back-off pulling image", "severity": "warning", "description": "Backing off image pull"},
    {"name": "Unhealthy", "pattern": "Unhealthy|probe failed", "severity": "info", "description": "Health probe failing"},
]

# Compiled patterns for performance
_COMPILED_RULES = [(rule, re.compile(rule["pattern"])) for rule in RULES]

# Priority order for scanning directories
PRIORITY_DIRS = [
    "cluster-resources/events",
    "cluster-resources/pods",
    "pod-logs",
]


def _get_priority(file_path: str) -> int:
    """Return a priority number for a file path (lower = scanned first)."""
    for idx, pdir in enumerate(PRIORITY_DIRS):
        if pdir in file_path:
            return idx
    return len(PRIORITY_DIRS)


def _collect_files(extracted_path: str) -> list[str]:
    """Collect all text files from the extracted bundle, sorted by priority."""
    all_files = []
    for root, _dirs, files in os.walk(extracted_path):
        for fname in files:
            full_path = os.path.join(root, fname)
            all_files.append(full_path)

    all_files.sort(key=_get_priority)
    return all_files


def scan_bundle(extracted_path: str) -> dict[str, Any]:
    """
    Scan extracted bundle files for known Kubernetes failure patterns.

    Returns a dict with:
      - findings: list of matches with rule info, file, line, line_number
      - scanned_files: number of files successfully scanned
      - total_files: total number of files found
    """
    files = _collect_files(extracted_path)
    total_files = len(files)
    scanned_files = 0
    findings: list[dict[str, Any]] = []

    logger.info("Scanning %d files in %s", total_files, extracted_path)

    for file_path in files:
        try:
            # Skip binary / very large files
            file_size = os.path.getsize(file_path)
            if file_size > 10 * 1024 * 1024:  # 10 MB
                logger.debug("Skipping large file: %s (%d bytes)", file_path, file_size)
                continue

            with open(file_path, "r", errors="ignore") as f:
                lines = f.readlines()

            scanned_files += 1
            rel_path = os.path.relpath(file_path, extracted_path)

            for line_num, line in enumerate(lines, start=1):
                for rule, compiled in _COMPILED_RULES:
                    if compiled.search(line):
                        findings.append({
                            "rule": rule["name"],
                            "severity": rule["severity"],
                            "description": rule["description"],
                            "file": rel_path,
                            "line_number": line_num,
                            "line": line.strip()[:500],  # truncate long lines
                        })

        except (OSError, UnicodeDecodeError) as exc:
            logger.debug("Could not read file %s: %s", file_path, exc)
            continue

    # Deduplicate: keep unique (rule, file) combos, but preserve all line refs
    seen: dict[tuple[str, str], dict] = {}
    for finding in findings:
        key = (finding["rule"], finding["file"])
        if key not in seen:
            seen[key] = {
                "rule": finding["rule"],
                "severity": finding["severity"],
                "description": finding["description"],
                "file": finding["file"],
                "matches": [],
            }
        if len(seen[key]["matches"]) < 5:  # cap matches per rule/file
            seen[key]["matches"].append({
                "line_number": finding["line_number"],
                "line": finding["line"],
            })

    deduped = list(seen.values())
    # Sort by severity: critical first, then warning, then info
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    deduped.sort(key=lambda f: severity_order.get(f["severity"], 3))

    logger.info("Scan complete: %d unique findings from %d/%d files", len(deduped), scanned_files, total_files)

    return {
        "findings": deduped,
        "scanned_files": scanned_files,
        "total_files": total_files,
    }
