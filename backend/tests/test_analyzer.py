import os
import tempfile

import pytest

from analyzer.analyzer import (
    MAX_FILE_CHARS,
    _extract_severity,
    _file_priority,
    _format_rule_findings,
    _read_file_truncated,
)


class TestFilePriorityEventsFirst:
    def test_file_priority_events_first(self):
        """cluster-resources/events has priority 0."""
        assert _file_priority("cluster-resources/events/default.json") == 0


class TestFilePriorityPodsSecond:
    def test_file_priority_pods_second(self):
        """cluster-resources/pods has priority 1."""
        assert _file_priority("cluster-resources/pods/default.json") == 1


class TestFilePriorityPreviousLogs:
    def test_file_priority_previous_logs(self):
        """Previous container logs get priority 1 (before regular pod-logs at 2)."""
        assert _file_priority("pod-logs/default/my-pod/my-container-previous.log") == 1
        # Regular pod-logs should be 2
        assert _file_priority("pod-logs/default/my-pod/my-container.log") == 2


class TestReadFileTruncated:
    def test_read_file_truncated(self, tmp_path):
        """Files over MAX_FILE_CHARS are tail-truncated."""
        content = "A" * (MAX_FILE_CHARS + 1000)
        f = tmp_path / "big.txt"
        f.write_text(content)

        result = _read_file_truncated(str(f))
        assert result is not None
        # Should contain truncation marker
        assert "[truncated, showing last portion]" in result
        # Should end with the tail of the original content
        assert result.endswith("A" * 100)
        # The tail portion should be MAX_FILE_CHARS long (plus the marker prefix)
        # Marker + last MAX_FILE_CHARS chars
        marker = "... [truncated, showing last portion] ...\n"
        assert len(result) == len(marker) + MAX_FILE_CHARS


class TestReadFileSkipLarge:
    def test_read_file_skip_large(self, tmp_path):
        """Files over 10MB return None."""
        f = tmp_path / "huge.bin"
        f.write_bytes(b"x" * (10 * 1024 * 1024 + 1))

        result = _read_file_truncated(str(f))
        assert result is None


class TestFormatRuleFindings:
    def test_format_rule_findings(self):
        """Correctly formats findings dict to string."""
        findings = {
            "findings": [
                {
                    "rule": "CrashLoopBackOff",
                    "severity": "critical",
                    "description": "Pod is crash-looping",
                    "file": "cluster-resources/events/default.json",
                    "matches": [
                        {"line_number": 5, "line": "CrashLoopBackOff detected"},
                        {"line_number": 10, "line": "CrashLoopBackOff again"},
                    ],
                }
            ],
            "scanned_files": 3,
            "total_files": 5,
        }

        result = _format_rule_findings(findings)
        assert "CrashLoopBackOff" in result
        assert "critical" in result
        assert "Pod is crash-looping" in result
        assert "Line 5" in result
        assert "Scanned 3 of 5 files" in result

    def test_format_rule_findings_empty(self):
        """Returns fallback message when no findings."""
        assert _format_rule_findings({}) == "No automated findings detected."
        assert _format_rule_findings({"findings": []}) == "No automated findings detected."
        assert _format_rule_findings(None) == "No automated findings detected."


class TestExtractSeverity:
    def test_extract_severity_critical(self):
        """Extracts 'critical' from text with SEVERITY: critical."""
        text = "SEVERITY: critical\n\n## Summary\nSomething is very wrong."
        assert _extract_severity(text) == "critical"

    def test_extract_severity_warning(self):
        """Extracts 'warning' from text with SEVERITY: warning."""
        text = "SEVERITY: warning\n\n## Summary\nSomething might be wrong."
        assert _extract_severity(text) == "warning"

    def test_extract_severity_info(self):
        """Extracts 'info' from text with SEVERITY: info."""
        text = "SEVERITY: info\n\n## Summary\nEverything looks fine."
        assert _extract_severity(text) == "info"

    def test_extract_severity_case_insensitive(self):
        """Handles case variations like SEVERITY: Critical."""
        text = "SEVERITY: Critical\n\n## Summary\n..."
        assert _extract_severity(text) == "critical"


class TestExtractSeverityFallback:
    def test_extract_severity_fallback_info(self):
        """Returns 'info' when no severity line found."""
        text = "This is just a normal diagnosis without any severity markers."
        assert _extract_severity(text) == "info"

    def test_extract_severity_fallback_critical_in_text(self):
        """Falls back to 'critical' if word 'critical' appears in first 200 chars."""
        text = "This is a critical issue that needs attention. " + ("x" * 300)
        assert _extract_severity(text) == "critical"

    def test_extract_severity_fallback_warning_in_text(self):
        """Falls back to 'warning' if word 'warning' appears in first 200 chars."""
        text = "This is a warning about resource usage. " + ("x" * 300)
        assert _extract_severity(text) == "warning"

    def test_extract_severity_fallback_keyword_after_200_chars(self):
        """Keywords after 200 chars are ignored in fallback; returns 'info'."""
        text = ("x" * 250) + " critical issue here"
        assert _extract_severity(text) == "info"
