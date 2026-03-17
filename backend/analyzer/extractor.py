import logging
import os
import tarfile
import tempfile

logger = logging.getLogger(__name__)


def extract_bundle(file_path: str) -> str:
    """
    Extract a .tar.gz support bundle to a temporary directory.

    Validates the file is a valid tar.gz archive, extracts it, and handles
    the common case where everything is nested inside a single top-level directory.

    Returns the path to the extracted content root.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Bundle file not found: {file_path}")

    if not tarfile.is_tarfile(file_path):
        raise ValueError(f"File is not a valid tar archive: {file_path}")

    extract_dir = tempfile.mkdtemp(prefix="bundle_")
    logger.info("Extracting bundle %s to %s", file_path, extract_dir)

    with tarfile.open(file_path, "r:gz") as tar:
        # Security: filter out absolute paths and path traversal
        members = tar.getmembers()
        safe_members = []
        for member in members:
            if member.name.startswith("/") or ".." in member.name:
                logger.warning("Skipping potentially unsafe path: %s", member.name)
                continue
            safe_members.append(member)

        tar.extractall(path=extract_dir, members=safe_members)

    # Handle nested top-level directory: if the archive extracted into a single
    # directory, return that directory as the root instead.
    entries = os.listdir(extract_dir)
    if len(entries) == 1:
        single_entry = os.path.join(extract_dir, entries[0])
        if os.path.isdir(single_entry):
            logger.info("Detected single top-level directory, using %s as root", single_entry)
            return single_entry

    return extract_dir
