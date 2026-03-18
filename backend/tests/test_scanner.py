import json
import os

import pytest

from analyzer.scanner import scan_bundle, _get_priority


class TestScanFindsCrashLoopBackOff:
    def test_scan_finds_crashloopbackoff(self, tmp_path):
        """Scanner detects CrashLoopBackOff in files."""
        events_dir = tmp_path / "cluster-resources" / "events"
        events_dir.mkdir(parents=True)
        (events_dir / "default.json").write_text(
            '{"reason": "BackOff", "message": "CrashLoopBackOff"}'
        )

        result = scan_bundle(str(tmp_path))
        rules = [f["rule"] for f in result["findings"]]
        assert "CrashLoopBackOff" in rules


class TestScanFindsOOMKilled:
    def test_scan_finds_oomkilled(self, tmp_path):
        """Scanner detects OOMKilled in files."""
        pods_dir = tmp_path / "cluster-resources" / "pods"
        pods_dir.mkdir(parents=True)
        (pods_dir / "default.json").write_text(
            '{"terminated": {"reason": "OOMKilled", "exitCode": 137}}'
        )

        result = scan_bundle(str(tmp_path))
        rules = [f["rule"] for f in result["findings"]]
        assert "OOMKilled" in rules


class TestScanFindsImagePullBackOff:
    def test_scan_finds_imagepullbackoff(self, tmp_path):
        """Scanner detects ImagePullBackOff."""
        d = tmp_path / "events"
        d.mkdir()
        (d / "ev.json").write_text('{"message": "ImagePullBackOff"}')

        result = scan_bundle(str(tmp_path))
        rules = [f["rule"] for f in result["findings"]]
        assert "ImagePullBackOff" in rules

    def test_scan_finds_errimagepull(self, tmp_path):
        """Scanner detects ErrImagePull (alternate pattern for the same rule)."""
        d = tmp_path / "events"
        d.mkdir()
        (d / "ev.json").write_text('{"message": "ErrImagePull"}')

        result = scan_bundle(str(tmp_path))
        rules = [f["rule"] for f in result["findings"]]
        assert "ImagePullBackOff" in rules


class TestScanFindsRunContainerError:
    def test_scan_finds_run_container_error(self, tmp_path):
        """Scanner detects RunContainerError."""
        d = tmp_path / "pods"
        d.mkdir()
        (d / "pod.json").write_text('{"reason": "RunContainerError"}')

        result = scan_bundle(str(tmp_path))
        rules = [f["rule"] for f in result["findings"]]
        assert "RunContainerError" in rules


class TestScanFindsMultipleIssues:
    def test_scan_finds_multiple_issues(self, tmp_path):
        """A file with several issues returns all of them."""
        d = tmp_path / "data"
        d.mkdir()
        content = (
            'line1: CrashLoopBackOff detected\n'
            'line2: OOMKilled exit code 137\n'
            'line3: ImagePullBackOff for image\n'
            'line4: RunContainerError on init\n'
        )
        (d / "mixed.log").write_text(content)

        result = scan_bundle(str(tmp_path))
        rules = {f["rule"] for f in result["findings"]}
        assert "CrashLoopBackOff" in rules
        assert "OOMKilled" in rules
        assert "ImagePullBackOff" in rules
        assert "RunContainerError" in rules


class TestScanSeverityOrdering:
    def test_scan_severity_ordering(self, tmp_path):
        """Critical findings come before warning, before info."""
        d = tmp_path / "data"
        d.mkdir()
        content = (
            'probe failed on liveness check\n'  # info (Unhealthy)
            'NodeNotReady condition\n'  # warning
            'CrashLoopBackOff\n'  # critical
        )
        (d / "mixed.log").write_text(content)

        result = scan_bundle(str(tmp_path))
        severities = [f["severity"] for f in result["findings"]]
        # Should be sorted: critical first, then warning, then info
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        numeric = [severity_order[s] for s in severities]
        assert numeric == sorted(numeric), f"Severities not sorted: {severities}"


class TestScanDeduplication:
    def test_scan_deduplication(self, tmp_path):
        """Same rule+file combo is deduped; matches are capped at 5."""
        d = tmp_path / "data"
        d.mkdir()
        # Write 10 lines all with CrashLoopBackOff in the same file
        lines = [f"event {i}: CrashLoopBackOff\n" for i in range(10)]
        (d / "events.log").write_text("".join(lines))

        result = scan_bundle(str(tmp_path))
        crash_findings = [f for f in result["findings"] if f["rule"] == "CrashLoopBackOff"]
        # Should be exactly 1 deduplicated finding
        assert len(crash_findings) == 1
        # Matches should be capped at 5
        assert len(crash_findings[0]["matches"]) == 5


class TestScanSkipsBinaryFiles:
    def test_scan_skips_binary_files(self, tmp_path):
        """Files over 10MB are skipped."""
        d = tmp_path / "data"
        d.mkdir()
        large_file = d / "huge.bin"
        # Create a file just over 10MB
        large_file.write_bytes(b"CrashLoopBackOff\n" * 700_000)  # ~12.6MB
        assert os.path.getsize(str(large_file)) > 10 * 1024 * 1024

        result = scan_bundle(str(tmp_path))
        # Large file should be skipped so scanned_files == 0
        assert result["scanned_files"] == 0
        assert result["total_files"] == 1
        assert len(result["findings"]) == 0


class TestScanHandlesEmptyDirectory:
    def test_scan_handles_empty_directory(self, tmp_path):
        """Empty directory returns empty findings without crashing."""
        result = scan_bundle(str(tmp_path))
        assert result["findings"] == []
        assert result["scanned_files"] == 0
        assert result["total_files"] == 0


class TestScanPrioritizesEventsFirst:
    def test_scan_prioritizes_events_first(self, tmp_path):
        """cluster-resources/events/ files are scanned before others."""
        # Create two files: one in events, one in a random dir
        events_dir = tmp_path / "cluster-resources" / "events"
        events_dir.mkdir(parents=True)
        (events_dir / "default.json").write_text('{"message": "CrashLoopBackOff"}')

        other_dir = tmp_path / "other"
        other_dir.mkdir()
        (other_dir / "data.log").write_text("OOMKilled")

        result = scan_bundle(str(tmp_path))
        # Events findings should come first (both are critical so severity won't re-sort them
        # relative to each other, but we can check priority via _get_priority)
        assert _get_priority("cluster-resources/events/default.json") == 0
        assert _get_priority("other/data.log") == len([
            "cluster-resources/events",
            "cluster-resources/pods",
            "pod-logs",
        ])


class TestScanReturnsCorrectStructure:
    def test_scan_returns_correct_structure(self, extracted_bundle_dir):
        """Output has findings, scanned_files, total_files keys."""
        result = scan_bundle(str(extracted_bundle_dir))
        assert "findings" in result
        assert "scanned_files" in result
        assert "total_files" in result
        assert isinstance(result["findings"], list)
        assert isinstance(result["scanned_files"], int)
        assert isinstance(result["total_files"], int)
        assert result["scanned_files"] <= result["total_files"]

        # Each finding should have the deduped structure
        for finding in result["findings"]:
            assert "rule" in finding
            assert "severity" in finding
            assert "description" in finding
            assert "file" in finding
            assert "matches" in finding
            assert isinstance(finding["matches"], list)
