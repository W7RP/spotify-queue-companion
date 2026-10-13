"""Exercise actual AppKit run-loop cleanup; no Spotify or install state is touched."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="qc-ui-lifecycle-") as folder:
    temporary = Path(folder)
    main = temporary / "main.swift"
    fixed = (root / "installer/macos/main.swift").read_text()
    # Reproduce the unsafe default on the same UI path before testing the fix.
    unsafe = fixed.replace("        window.isReleasedWhenClosed = false\n", "")
    assert unsafe != fixed
    main.write_text(unsafe)
    binary = temporary / "UnsafeLauncher"
    subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-O",
                    str(root / "installer/macos/Installer.swift"), str(main), "-o", str(binary)], check=True)
    env = dict(os.environ, MallocScribble="1")
    before = subprocess.run([str(binary), "--ui-self-test"], env=env, capture_output=True, timeout=45)
    print("Unsafe window lifecycle exit code:", before.returncode, flush=True)
    assert before.returncode < 0, "Unsafe lifecycle did not reproduce a process crash"
    main.write_text(fixed)
    binary = temporary / "FixedLauncher"
    subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-O",
                    str(root / "installer/macos/Installer.swift"), str(main), "-o", str(binary)], check=True)
    subprocess.run([str(binary), "--ui-self-test"], env=env, check=True, timeout=45)
    print("Unsafe lifecycle reproduced; fixed installer completed all UI transitions", flush=True)
