from __future__ import annotations

import subprocess
import sys


def test_static_boundary_checker_reports_zero_counts():
    result = subprocess.run([sys.executable, "tools/verify_static_boundary.py"], capture_output=True, text=True, check=True)
    assert "StartInstance callsite count = 0" in result.stdout
    assert "StopInstance callsite count = 0" in result.stdout
    assert "provider lifecycle mutation-send callsite count = 0" in result.stdout
