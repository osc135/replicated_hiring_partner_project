import os
import tarfile
import tempfile

import pytest

from analyzer.extractor import extract_bundle


class TestExtractValidBundle:
    def test_extract_valid_bundle(self, bundle_tar_gz):
        """Extracts a .tar.gz and returns a directory path."""
        result = extract_bundle(bundle_tar_gz)
        assert os.path.isdir(result)
        # Should contain our bundle files
        entries = os.listdir(result)
        assert len(entries) > 0


class TestExtractHandlesNestedDirectory:
    def test_extract_handles_nested_directory(self, tmp_path):
        """If bundle has a single top-level dir, returns that dir."""
        # Create a tar.gz with a single top-level directory
        content_dir = tmp_path / "content" / "support-bundle"
        content_dir.mkdir(parents=True)
        (content_dir / "test.txt").write_text("hello")

        tar_path = str(tmp_path / "nested.tar.gz")
        with tarfile.open(tar_path, "w:gz") as tar:
            tar.add(str(content_dir.parent / "support-bundle"), arcname="support-bundle")

        result = extract_bundle(tar_path)
        # Should return the inner "support-bundle" directory, not the extract root
        assert os.path.basename(result) == "support-bundle"
        assert os.path.isfile(os.path.join(result, "test.txt"))


class TestExtractRejectsNonTarfile:
    def test_extract_rejects_non_tarfile(self, tmp_path):
        """Raises ValueError for non-tar files."""
        txt_file = tmp_path / "notabundle.txt"
        txt_file.write_text("this is not a tarball")

        with pytest.raises(ValueError, match="not a valid tar archive"):
            extract_bundle(str(txt_file))


class TestExtractRejectsMissingFile:
    def test_extract_rejects_missing_file(self):
        """Raises FileNotFoundError for nonexistent files."""
        with pytest.raises(FileNotFoundError, match="Bundle file not found"):
            extract_bundle("/nonexistent/path/bundle.tar.gz")


class TestExtractBlocksPathTraversal:
    def test_extract_blocks_path_traversal(self, tmp_path):
        """Members with .. in path are skipped."""
        # Create a tar.gz with a path-traversal member
        safe_file = tmp_path / "safe.txt"
        safe_file.write_text("safe content")

        tar_path = str(tmp_path / "evil.tar.gz")
        with tarfile.open(tar_path, "w:gz") as tar:
            # Add a safe file
            tar.add(str(safe_file), arcname="safe.txt")
            # Add a malicious member with path traversal
            info = tarfile.TarInfo(name="../../../etc/passwd")
            info.size = 5
            import io
            tar.addfile(info, io.BytesIO(b"evil\n"))

        result = extract_bundle(tar_path)
        # The safe file should exist
        assert os.path.isfile(os.path.join(result, "safe.txt"))
        # The traversal file should NOT have been extracted anywhere
        assert not os.path.exists(os.path.join(result, "..", "..", "..", "etc", "passwd"))
