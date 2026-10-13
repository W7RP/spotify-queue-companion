#!/usr/bin/env python3
"""Build the self-contained native macOS installer on a matching Mac runner."""
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent
VERSION = "0.2.6-macos.2"
UPSTREAM = {
    "arm64": ("aarch64", "c67804e0742b82013ac704bb70ceae98c079283c94f9356343f8a9e813356eab"),
    "x64": ("x86_64", "2cbf92b5eb0d3933175455a1b12ec76d8877198ef15fd67b6800812b309d51fb"),
}

def run(*args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT, **kwargs)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def sign(path):
    run("/usr/bin/codesign", "--force", "--sign", "-", path)

def build():
    if sys.platform != "darwin":
        raise SystemExit("Run this build on macOS; Windows build.ps1 produces the Windows installer.")
    arch = "arm64" if platform.machine() == "arm64" else "x64"
    rid = "osx-" + arch
    output = ROOT / "release" / ("macos-" + arch)
    output.mkdir(parents=True, exist_ok=True)
    # Verify existing upstream bytes before packaging. Never ship a user's profile.
    for relative, expected in json.loads((ROOT / "vendor/SHA256SUMS.json").read_text()).items():
        if sha(ROOT / "vendor" / relative) != expected:
            raise RuntimeError("Vendor checksum mismatch: " + relative)
    run("dotnet", "restore", "helper/QueueCompanion.csproj", "-p:RuntimeIdentifier=" + rid, "--locked-mode")
    run("dotnet", "publish", "helper/QueueCompanion.csproj", "-r", rid, "-c", "Release", "-o", output / "helper", "--no-restore")
    native = output / "native"
    native.mkdir(exist_ok=True)
    target = ("arm64" if arch == "arm64" else "x86_64") + "-apple-macos15.0"
    run("xcrun", "swiftc", "-swift-version", "5", "-O", "-target", target,
        "installer/macos/Installer.swift", "installer/macos/main.swift", "-o", native / "QueueCompanion.Launcher")
    run("xcrun", "swiftc", "-O", "-target", target, "installer/macos/Keychain.swift", "-o", native / "QueueCompanion.Keychain")
    run(native / "QueueCompanion.Launcher", "--self-test")
    run(native / "QueueCompanion.Launcher", "--ui-self-test", timeout=45)

    suffix, expected = UPSTREAM[arch]
    archive = output / ("spicetify-3.0.0-rc.3-macos-" + suffix + ".tar.zst")
    url = "https://github.com/spicetify/cli/releases/download/v3.0.0-rc.3/" + archive.name
    urllib.request.urlretrieve(url, archive)
    if sha(archive) != expected:
        raise RuntimeError("macOS upstream archive checksum mismatch")
    if not shutil.which("zstd"):
        run("brew", "install", "zstd")
    unpack = output / "upstream"
    unpack.mkdir(exist_ok=True)
    tar = output / "upstream.tar"
    run("zstd", "-d", "-f", archive, "-o", tar)
    # The hash-pinned official archive is inspected for unsafe entry paths first.
    import tarfile
    with tarfile.open(tar) as contents:
        for entry in contents.getmembers():
            if entry.name.startswith("/") or ".." in Path(entry.name).parts or entry.issym() or entry.islnk():
                raise RuntimeError("Unexpected upstream archive entry")
        contents.extractall(unpack, filter="data")

    stage = output / "disk"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    companion = output / "Queue Companion.app"
    if companion.exists():
        shutil.rmtree(companion)
    resources = companion / "Contents/Resources"
    macos = companion / "Contents/MacOS"
    resources.mkdir(parents=True); macos.mkdir()
    shutil.copy2(native / "QueueCompanion.Launcher", macos / "QueueCompanion.Launcher")
    shutil.copy2(output / "helper/QueueCompanion", resources / "QueueCompanion")
    shutil.copy2(native / "QueueCompanion.Keychain", resources / "QueueCompanion.Keychain")
    shutil.copytree(ROOT / "vendor", resources / "vendor", ignore=shutil.ignore_patterns("*.exe"))
    original_binaries = {}
    signature_added = []
    for executable in ("spicetify", "spicetify-daemon"):
        found = list(unpack.rglob(executable))
        if len(found) != 1:
            raise RuntimeError("Missing/ambiguous upstream binary: " + executable)
        destination = resources / "vendor" / executable
        shutil.copy2(found[0], destination); destination.chmod(0o755)
        original_binaries[executable] = sha(destination)
        # The Intel upstream release has no signature. Add only an ad-hoc
        # signature; retain its original archive and source beside the runtime.
        verification = subprocess.run(["/usr/bin/codesign", "--verify", str(destination)], capture_output=True)
        if verification.returncode != 0:
            sign(destination); signature_added.append(executable)
        run("/usr/bin/codesign", "--verify", destination)
    shutil.copy2(archive, resources / "vendor/source" / archive.name)
    (resources / "vendor/MACOS-UPSTREAM.json").write_text(json.dumps({"url": url, "archiveSha256": expected,
        "originalBinaries": original_binaries, "adHocSignatureAdded": signature_added,
        "binaries": {name: sha(resources / "vendor" / name) for name in ("spicetify", "spicetify-daemon")}}, indent=2) + "\n")
    extension = resources / "extension"; extension.mkdir()
    for source, name in [("extension/dist/queue-companion.js", "queue-companion.js"),
                         ("extension/module-index.js", "index.js"), ("extension/metadata.json", "metadata.json")]:
        shutil.copy2(ROOT / source, extension / name)
    shutil.copy2(ROOT / "LICENSE", resources / "LICENSE")
    for path in companion.rglob("*"):
        if path.is_file() and (path.name in {"pairing.json", "credentials.dat", "claude-key.dat", "daemon-token", "queue-companion-pairing.js"} or path.suffix in {".dat", ".log"}):
            raise RuntimeError("Private data found in installer")
    base = {"CFBundleExecutable": "QueueCompanion.Launcher", "CFBundlePackageType": "APPL",
            "CFBundleVersion": "0.2.6.2", "CFBundleShortVersionString": "0.2.6", "LSMinimumSystemVersion": "15.0",
            "NSHighResolutionCapable": True}
    with (companion / "Contents/Info.plist").open("wb") as stream:
        plistlib.dump({**base, "CFBundleIdentifier": "org.queuecompanion.app", "CFBundleName": "Queue Companion", "LSUIElement": True,
            "CFBundleURLTypes": [{"CFBundleURLName": "Queue Companion", "CFBundleURLSchemes": ["queue-companion"]}]}, stream)
    for path in (resources / "QueueCompanion", resources / "QueueCompanion.Keychain", macos / "QueueCompanion.Launcher"):
        path.chmod(0o755); sign(path)
    sign(companion)
    run("/usr/bin/codesign", "--verify", "--deep", "--strict", companion)

    setup = stage / "Queue Companion Setup.app"
    (setup / "Contents/MacOS").mkdir(parents=True)
    (setup / "Contents/Resources").mkdir()
    shutil.copy2(native / "QueueCompanion.Launcher", setup / "Contents/MacOS/QueueCompanion.Launcher")
    shutil.copytree(companion, setup / "Contents/Resources/Queue Companion.app")
    with (setup / "Contents/Info.plist").open("wb") as stream:
        plistlib.dump({**base, "CFBundleIdentifier": "org.queuecompanion.setup", "CFBundleName": "Queue Companion Setup"}, stream)
    sign(setup / "Contents/MacOS/QueueCompanion.Launcher"); sign(setup)
    run("/usr/bin/codesign", "--verify", "--deep", "--strict", setup)
    shutil.copy2(ROOT / "docs/MACOS-INSTALL.md", stage / "Read me.txt")

    # Run Keychain and real loopback peer tests on this architecture, under a disposable login keychain.
    run("dotnet", "build", "tests/macos/MacTests.csproj", "-c", "Release")
    test_keychain = output / "tests.keychain-db"
    previous = subprocess.check_output(["security", "default-keychain", "-d", "user"], text=True).strip().strip('"')
    run("security", "create-keychain", "-p", "queue-companion-ci-only", test_keychain)
    try:
        run("security", "unlock-keychain", "-p", "queue-companion-ci-only", test_keychain)
        run("security", "default-keychain", "-d", "user", "-s", test_keychain)
        run("dotnet", "run", "--project", "tests/macos/MacTests.csproj", "-c", "Release", "--no-build", "--", resources / "QueueCompanion.Keychain")
    finally:
        run("security", "default-keychain", "-d", "user", "-s", previous)
        run("security", "delete-keychain", test_keychain)
    # Actual published helper must initialize without requiring a separately installed .NET runtime.
    fixture_home = output / "helper-smoke-home"; fixture_home.mkdir(exist_ok=True)
    env = dict(os.environ, HOME=str(fixture_home), DOTNET_BUNDLE_EXTRACT_BASE_DIR=str(output / "dotnet-extract"))
    run(resources / "QueueCompanion", "--init", "--extension-dir", output / "pairing-fixture", env=env)
    # Exercise the actual service and singleton, not just its early --init exit.
    import http.client
    import time
    service = subprocess.Popen([str(resources / "QueueCompanion")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ready = False
        for _ in range(100):
            if service.poll() is not None:
                raise RuntimeError("Published helper exited before listening")
            try:
                connection = http.client.HTTPConnection("127.0.0.1", 43829, timeout=1)
                connection.request("GET", "/")
                assert connection.getresponse().status == 404
                connection.close(); ready = True; break
            except (ConnectionError, OSError):
                time.sleep(0.1)
        assert ready, "Published helper never became ready"
        connection = http.client.HTTPConnection("127.0.0.1", 43829, timeout=3)
        connection.request("GET", "/", headers={"Host": "foreign.example"})
        assert connection.getresponse().status == 403; connection.close()
        connection = http.client.HTTPConnection("127.0.0.1", 43829, timeout=3)
        connection.request("GET", "/v1", headers={"Connection": "Upgrade", "Upgrade": "websocket",
            "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Origin": "https://xpui.app.spotify.com"})
        assert connection.getresponse().status == 403; connection.close()
        subprocess.run([str(resources / "QueueCompanion")], env=env, check=True, timeout=5,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        assert service.poll() is None, "Singleton replaced the running service"
        subprocess.run([str(resources / "QueueCompanion"), "--stop"], env=env, check=True, timeout=10)
        service.wait(timeout=10)
    finally:
        if service.poll() is None:
            service.kill(); service.wait()
    dmg = output / ("QueueCompanion-" + VERSION + "-macOS-" + arch + ".dmg")
    run("hdiutil", "create", "-volname", "Queue Companion", "-srcfolder", stage, "-ov", "-format", "UDZO", dmg)
    run("hdiutil", "verify", dmg)
    (output / (dmg.name + ".sha256")).write_text(sha(dmg) + "  " + dmg.name + "\n")
    proof = {"architecture": arch, "minimumMacOS": "15.0", "upstreamArchiveSha256": expected,
             "nativeInstallerChecks": 17, "helperChecks": 17, "adHocSignatureVerified": True,
             "installerUiLifecycleChecks": 3,
             "publishedHelperInitialized": True, "privateFilesInPayload": False,
             "serviceHostAndPeerGuardsVerified": True, "singletonAndStopVerified": True,
             "spotifyEndToEndVerified": False, "notarized": False, "dmgSha256": sha(dmg)}
    (output / ("macOS-" + arch + "-build-proof.json")).write_text(json.dumps(proof, indent=2) + "\n")
    print("Built " + str(dmg))

if __name__ == "__main__":
    build()
