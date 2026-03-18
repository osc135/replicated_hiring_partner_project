"""Parse structured cluster data (pods, nodes, events) from extracted support bundles."""

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Reasons that indicate unhealthy state
_ERROR_REASONS = {
    "Failed", "BackOff", "CrashLoopBackOff", "ImagePullBackOff",
    "ErrImagePull", "RunContainerError", "OOMKilled", "Unhealthy",
    "FailedScheduling", "FailedMount", "FailedCreate",
}


def _parse_json_file(path: str) -> dict | list | None:
    """Safely parse a JSON file, returning None on failure."""
    try:
        with open(path, "r", errors="replace") as f:
            return json.load(f)
    except Exception:
        logger.debug("Failed to parse JSON: %s", path)
        return None


def _parse_pods(extracted_path: str) -> list[dict[str, Any]]:
    """Parse pod data from cluster-resources/pods/*.json."""
    pods = []
    pods_dir = os.path.join(extracted_path, "cluster-resources", "pods")
    if not os.path.isdir(pods_dir):
        return pods

    for fname in os.listdir(pods_dir):
        if not fname.endswith(".json"):
            continue
        data = _parse_json_file(os.path.join(pods_dir, fname))
        if not data or not isinstance(data, dict):
            continue

        for item in (data.get("items") or []):
            metadata = item.get("metadata", {})
            spec = item.get("spec", {})
            status = item.get("status", {})

            container_statuses = status.get("containerStatuses", [])
            all_ready = all(cs.get("ready", False) for cs in container_statuses) if container_statuses else False

            # Determine effective status
            phase = status.get("phase", "Unknown")
            # Check for specific failure states in container statuses
            effective_status = phase
            for cs in container_statuses:
                state = cs.get("state", {})
                if "waiting" in state:
                    reason = state["waiting"].get("reason", "")
                    if reason in ("CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull", "RunContainerError"):
                        effective_status = reason
                        break
                elif "terminated" in state:
                    reason = state["terminated"].get("reason", "")
                    if reason in ("OOMKilled", "Error"):
                        effective_status = reason
                        break

            pods.append({
                "name": metadata.get("name", "unknown"),
                "namespace": metadata.get("namespace", "default"),
                "status": effective_status,
                "node": spec.get("nodeName", "unassigned"),
                "ready": phase == "Running" and all_ready,
                "containers": [
                    {
                        "name": cs.get("name", ""),
                        "ready": cs.get("ready", False),
                        "restarts": cs.get("restartCount", 0),
                    }
                    for cs in container_statuses
                ],
            })

    return pods


def _parse_nodes(extracted_path: str) -> list[dict[str, Any]]:
    """Parse node data from cluster-resources/nodes.json or nodes/*.json."""
    nodes = []

    # Try nodes.json first (some bundles have it at top level)
    for candidate in [
        os.path.join(extracted_path, "cluster-resources", "nodes.json"),
        os.path.join(extracted_path, "cluster-resources", "nodes", "nodes.json"),
    ]:
        if os.path.isfile(candidate):
            data = _parse_json_file(candidate)
            if data and isinstance(data, dict):
                for item in (data.get("items") or []):
                    metadata = item.get("metadata", {})
                    status_obj = item.get("status", {})
                    conditions = status_obj.get("conditions", [])

                    node_ready = "Unknown"
                    for cond in conditions:
                        if cond.get("type") == "Ready":
                            node_ready = "Ready" if cond.get("status") == "True" else "NotReady"
                            break

                    nodes.append({
                        "name": metadata.get("name", "unknown"),
                        "status": node_ready,
                        "conditions": [
                            {"type": c.get("type", ""), "status": c.get("status", "")}
                            for c in conditions
                        ],
                    })
                return nodes

    # Try nodes/ directory
    nodes_dir = os.path.join(extracted_path, "cluster-resources", "nodes")
    if os.path.isdir(nodes_dir):
        for fname in os.listdir(nodes_dir):
            if not fname.endswith(".json"):
                continue
            data = _parse_json_file(os.path.join(nodes_dir, fname))
            if not data or not isinstance(data, dict):
                continue
            for item in (data.get("items") or []):
                metadata = item.get("metadata", {})
                status_obj = item.get("status", {})
                conditions = status_obj.get("conditions", [])

                node_ready = "Unknown"
                for cond in conditions:
                    if cond.get("type") == "Ready":
                        node_ready = "Ready" if cond.get("status") == "True" else "NotReady"
                        break

                nodes.append({
                    "name": metadata.get("name", "unknown"),
                    "status": node_ready,
                    "conditions": [
                        {"type": c.get("type", ""), "status": c.get("status", "")}
                        for c in conditions
                    ],
                })

    return nodes


def _parse_events(extracted_path: str) -> list[dict[str, Any]]:
    """Parse event data from cluster-resources/events/*.json."""
    events = []
    events_dir = os.path.join(extracted_path, "cluster-resources", "events")
    if not os.path.isdir(events_dir):
        return events

    for fname in os.listdir(events_dir):
        if not fname.endswith(".json"):
            continue
        data = _parse_json_file(os.path.join(events_dir, fname))
        if not data or not isinstance(data, dict):
            continue

        for item in (data.get("items") or []):
            # Try multiple timestamp fields
            ts = (
                item.get("lastTimestamp")
                or item.get("eventTime")
                or item.get("firstTimestamp")
                or ""
            )

            reason = item.get("reason", "")
            involved = item.get("involvedObject", {})

            events.append({
                "timestamp": ts,
                "reason": reason,
                "message": (item.get("message", "") or "")[:300],
                "kind": involved.get("kind", ""),
                "name": involved.get("name", ""),
                "namespace": involved.get("namespace", ""),
                "type": item.get("type", "Normal"),  # Normal or Warning
            })

    # Sort by timestamp (most recent first), empty timestamps last
    events.sort(key=lambda e: e["timestamp"] or "0000", reverse=True)
    return events


def parse_cluster_data(extracted_path: str) -> dict[str, Any]:
    """
    Parse structured cluster data from an extracted support bundle.

    Returns a dict with pods, nodes, events, and summary statistics.
    """
    pods = _parse_pods(extracted_path)
    nodes = _parse_nodes(extracted_path)
    events = _parse_events(extracted_path)

    healthy_pods = sum(1 for p in pods if p["ready"])
    unhealthy_pods = len(pods) - healthy_pods

    # Infer nodes from pod assignments if no explicit node data
    if not nodes and pods:
        node_names = {p["node"] for p in pods if p["node"] != "unassigned"}
        nodes = [{"name": n, "status": "Unknown", "conditions": []} for n in sorted(node_names)]

    return {
        "pods": pods,
        "nodes": nodes,
        "events": events[:200],  # Cap events
        "summary": {
            "total_pods": len(pods),
            "healthy_pods": healthy_pods,
            "unhealthy_pods": unhealthy_pods,
            "node_count": len(nodes),
            "event_count": len(events),
        },
    }
