"""
Shared configuration and helpers for the eval suite.

Provides:
- Bundle extraction to temp directories
- Synthetic bundle creation with known K8s failure patterns
- Constants for expected findings
"""

import json
import os
import tempfile

from analyzer.extractor import extract_bundle


# ---------------------------------------------------------------------------
# Constants: expected findings for the real test bundle
# ---------------------------------------------------------------------------

EXPECTED_RULES = [
    "CrashLoopBackOff",
    "ImagePullBackOff",
    "RunContainerError",
]

EXPECTED_LLM_SECTIONS = [
    "## Summary",
    "## Findings",
    "## Root Cause",
    "## Recommended Actions",
]

EXPECTED_KEYWORDS_IN_LLM = [
    "CrashLoopBackOff",
    "ImagePullBackOff",
]

# At least one of these should appear for the OOM / RunContainerError pod
EXPECTED_OOM_KEYWORDS = [
    "OOMKilled",
    "RunContainerError",
]


# ---------------------------------------------------------------------------
# Bundle extraction helper
# ---------------------------------------------------------------------------

def extract_bundle_to_temp(bundle_path: str) -> str:
    """Extract a real .tar.gz bundle and return the extracted root path."""
    return extract_bundle(bundle_path)


# ---------------------------------------------------------------------------
# Synthetic bundle builder
# ---------------------------------------------------------------------------

def create_synthetic_bundle() -> str:
    """
    Create a temporary directory that mimics a Kubernetes support bundle
    with known failure patterns.  Returns the path to the synthetic bundle root.

    Structure produced:
        <tmpdir>/
            cluster-resources/
                events/
                    events.json
                pods/
                    pods.json
            pod-logs/
                default/
                    crasher/
                        crasher.log
                    bad-image/
                        bad-image.log
                    oom-demo/
                        oom-demo.log
    """
    root = tempfile.mkdtemp(prefix="synth_bundle_")

    # -- cluster-resources/events/events.json ----------------------------------
    events_dir = os.path.join(root, "cluster-resources", "events")
    os.makedirs(events_dir, exist_ok=True)

    events = {
        "apiVersion": "v1",
        "items": [
            {
                "kind": "Event",
                "metadata": {"name": "crasher.abc123", "namespace": "default"},
                "involvedObject": {"kind": "Pod", "name": "crasher-7f8b9d6c5-xq2nz", "namespace": "default"},
                "reason": "BackOff",
                "message": "Back-off restarting failed container: container \"crasher\" in pod \"crasher-7f8b9d6c5-xq2nz\" is waiting to start: CrashLoopBackOff",
                "type": "Warning",
                "count": 42,
            },
            {
                "kind": "Event",
                "metadata": {"name": "bad-image.def456", "namespace": "default"},
                "involvedObject": {"kind": "Pod", "name": "bad-image-5c4d3b2a1-mk9rw", "namespace": "default"},
                "reason": "Failed",
                "message": "Failed to pull image \"registry.example.com/no-such-image:latest\": rpc error: code = NotFound desc = failed to pull and unpack image: ErrImagePull",
                "type": "Warning",
                "count": 15,
            },
            {
                "kind": "Event",
                "metadata": {"name": "bad-image.ghi789", "namespace": "default"},
                "involvedObject": {"kind": "Pod", "name": "bad-image-5c4d3b2a1-mk9rw", "namespace": "default"},
                "reason": "Failed",
                "message": "Error: ImagePullBackOff",
                "type": "Warning",
                "count": 15,
            },
            {
                "kind": "Event",
                "metadata": {"name": "oom-demo.jkl012", "namespace": "default"},
                "involvedObject": {"kind": "Pod", "name": "oom-demo-9a8b7c6d5-ht3vp", "namespace": "default"},
                "reason": "Failed",
                "message": "Error: RunContainerError - container killed due to OOM, memory limit 1Mi exceeded",
                "type": "Warning",
                "count": 8,
            },
        ],
    }
    with open(os.path.join(events_dir, "events.json"), "w") as f:
        json.dump(events, f, indent=2)

    # -- cluster-resources/pods/pods.json --------------------------------------
    pods_dir = os.path.join(root, "cluster-resources", "pods")
    os.makedirs(pods_dir, exist_ok=True)

    pods = {
        "apiVersion": "v1",
        "items": [
            {
                "kind": "Pod",
                "metadata": {"name": "crasher-7f8b9d6c5-xq2nz", "namespace": "default"},
                "status": {
                    "phase": "Running",
                    "containerStatuses": [
                        {
                            "name": "crasher",
                            "state": {"waiting": {"reason": "CrashLoopBackOff", "message": "back-off 5m0s restarting failed container"}},
                            "restartCount": 42,
                            "lastState": {"terminated": {"exitCode": 1, "reason": "Error"}},
                        }
                    ],
                },
            },
            {
                "kind": "Pod",
                "metadata": {"name": "bad-image-5c4d3b2a1-mk9rw", "namespace": "default"},
                "status": {
                    "phase": "Pending",
                    "containerStatuses": [
                        {
                            "name": "bad-image",
                            "state": {"waiting": {"reason": "ImagePullBackOff", "message": "Back-off pulling image \"registry.example.com/no-such-image:latest\""}},
                            "restartCount": 0,
                        }
                    ],
                },
            },
            {
                "kind": "Pod",
                "metadata": {"name": "oom-demo-9a8b7c6d5-ht3vp", "namespace": "default"},
                "status": {
                    "phase": "Running",
                    "containerStatuses": [
                        {
                            "name": "oom-demo",
                            "state": {"waiting": {"reason": "RunContainerError", "message": "OOMKilled"}},
                            "restartCount": 5,
                            "lastState": {"terminated": {"exitCode": 137, "reason": "OOMKilled"}},
                        }
                    ],
                },
            },
        ],
    }
    with open(os.path.join(pods_dir, "pods.json"), "w") as f:
        json.dump(pods, f, indent=2)

    # -- pod-logs --------------------------------------------------------------
    logs_base = os.path.join(root, "pod-logs", "default")

    # crasher log
    crasher_log_dir = os.path.join(logs_base, "crasher-7f8b9d6c5-xq2nz")
    os.makedirs(crasher_log_dir, exist_ok=True)
    with open(os.path.join(crasher_log_dir, "crasher.log"), "w") as f:
        f.write(
            "2026-03-16T18:00:01Z INFO  Starting application...\n"
            "2026-03-16T18:00:01Z ERROR Fatal: unable to connect to database\n"
            "2026-03-16T18:00:01Z ERROR Exiting with code 1\n"
        )

    # bad-image log (empty — image never pulled)
    bad_image_log_dir = os.path.join(logs_base, "bad-image-5c4d3b2a1-mk9rw")
    os.makedirs(bad_image_log_dir, exist_ok=True)
    with open(os.path.join(bad_image_log_dir, "bad-image.log"), "w") as f:
        f.write("")

    # oom-demo log
    oom_log_dir = os.path.join(logs_base, "oom-demo-9a8b7c6d5-ht3vp")
    os.makedirs(oom_log_dir, exist_ok=True)
    with open(os.path.join(oom_log_dir, "oom-demo.log"), "w") as f:
        f.write(
            "2026-03-16T18:10:00Z INFO  Allocating memory buffer...\n"
            "2026-03-16T18:10:00Z WARN  Memory usage at 95%\n"
            "2026-03-16T18:10:01Z FATAL OOMKilled — container exceeded 1Mi memory limit\n"
        )

    return root
