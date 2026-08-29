import struct
import tempfile
import unittest
from pathlib import Path

from verify_windows_bundle import read_pe_subsystem, verify_windows_artifacts


def write_pe(path: Path, subsystem: int) -> None:
    data = bytearray(256)
    data[:2] = b"MZ"
    pe_offset = 0x80
    struct.pack_into("<I", data, 0x3C, pe_offset)
    data[pe_offset : pe_offset + 4] = b"PE\0\0"
    struct.pack_into("<H", data, pe_offset + 24, 0x20B)
    struct.pack_into("<H", data, pe_offset + 24 + 68, subsystem)
    path.write_bytes(data)


class WindowsBundleVerifierTests(unittest.TestCase):
    def test_accepts_gui_executable_and_installer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "app.exe"
            installer = root / "setup.exe"
            write_pe(executable, 2)
            installer.write_bytes(b"installer")
            self.assertEqual(read_pe_subsystem(executable), 2)
            self.assertEqual(verify_windows_artifacts(executable, installer), [])

    def test_rejects_console_subsystem(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "app.exe"
            installer = root / "setup.exe"
            write_pe(executable, 3)
            installer.write_bytes(b"installer")
            failures = verify_windows_artifacts(executable, installer)
            self.assertTrue(any("expected Windows GUI subsystem" in item for item in failures))


if __name__ == "__main__":
    unittest.main()
