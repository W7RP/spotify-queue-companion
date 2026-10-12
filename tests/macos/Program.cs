using System.Diagnostics;
using System.Text;
using System.Net;
using System.Net.Sockets;
using QueueCompanion;

var passed = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; }
const string exe = "/Applications/Spotify.app/Contents/MacOS/Spotify";
Check(SpotifyInstallation.MatchesMacPeer(exe, exe), "Main Spotify executable rejected");
Check(SpotifyInstallation.MatchesMacPeer("/Applications/Spotify.app/Contents/Frameworks/Spotify Helper (Renderer).app/Contents/MacOS/Spotify Helper (Renderer)", exe), "Renderer helper rejected");
Check(!SpotifyInstallation.MatchesMacPeer("/Applications/Other.app/Contents/MacOS/Spotify", exe), "Unselected Spotify accepted");
Check(!SpotifyInstallation.MatchesMacPeer("/Applications/Spotify.app/Contents/Frameworks/../MacOS/Spotify Helper", exe), "Traversal accepted");
Check(!SpotifyInstallation.MatchesMacPeer("/Applications/Spotify.app/Contents/Frameworks/Evil.app/Contents/MacOS/Evil", exe), "Foreign helper accepted");
Check(!SpotifyInstallation.MatchesMacPeer(exe, "/Applications/Spotify.app/Contents/MacOS/Evil"), "Foreign selected executable accepted");
if (!OperatingSystem.IsMacOS()) { Console.WriteLine($"{passed} macOS path checks passed (native checks require macOS)"); return; }

File.Copy(args.Single(), Path.Combine(AppContext.BaseDirectory, "QueueCompanion.Keychain"), true);
File.SetUnixFileMode(Path.Combine(AppContext.BaseDirectory, "QueueCompanion.Keychain"), UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
var root = Path.Combine(Path.GetTempPath(), "qc-mac-tests-" + Guid.NewGuid());
var store = new Storage(root);
try
{
    Check(File.GetUnixFileMode(root) == (UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute), "Private directory permissions incorrect");
    store.Write("settings.json", new Settings());
    Check(File.GetUnixFileMode(Path.Combine(root, "settings.json")) == (UnixFileMode.UserRead | UnixFileMode.UserWrite), "Private file permissions incorrect");
    store.WriteSecret("claude-key.dat", new { value = "FAKE_MAC_TEST_SECRET" });
    Check(store.ReadSecret<System.Text.Json.JsonElement>("claude-key.dat").GetProperty("value").GetString() == "FAKE_MAC_TEST_SECRET", "Keychain round-trip failed");
    Check(!Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(root, "claude-key.dat"))).Contains("FAKE_MAC_TEST_SECRET"), "Secret leaked to disk");
    store.WriteSecret("claude-key.dat", new { value = "UPDATED_FAKE_SECRET" });
    Check(store.ReadSecret<System.Text.Json.JsonElement>("claude-key.dat").GetProperty("value").GetString() == "UPDATED_FAKE_SECRET", "Keychain update failed");
    var other = new Storage(root + "-other");
    Check(other.ReadSecret<System.Text.Json.JsonElement>("claude-key.dat").ValueKind == System.Text.Json.JsonValueKind.Undefined, "Secrets leaked to another storage root");
    Directory.Delete(other.Root, true);
    store.Delete("claude-key.dat");
    Check(!File.Exists(Path.Combine(root, "claude-key.dat")), "Credential marker survived disconnect");
    Check(MacSecrets.Run("get", Storage.Key(root + ":claude-key.dat")).Length == 0, "Keychain item survived disconnect");
    // A real established connection from this test executable must fail the Spotify check.
    using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
    int port = ((IPEndPoint)listener.LocalEndpoint).Port;
    using var client = new TcpClient(); await client.ConnectAsync(IPAddress.Loopback, port);
    using var server = await listener.AcceptTcpClientAsync();
    int peerPort = ((IPEndPoint)client.Client.LocalEndPoint!).Port;
    Check(!MacPeer.IsSpotify(peerPort, port, Environment.ProcessPath), "Foreign process accepted as Spotify");
    // Verify lsof/proc_pidpath actually locate the client, rather than passing by always rejecting.
    var fakeApp = Path.Combine(root, "Fixture.app", "Contents", "MacOS"); Directory.CreateDirectory(fakeApp);
    var fakeSpotify = Path.Combine(fakeApp, "Spotify"); File.Copy("/usr/bin/nc", fakeSpotify);
    File.SetUnixFileMode(fakeSpotify, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    using var child = Process.Start(new ProcessStartInfo(fakeSpotify) { ArgumentList = { "127.0.0.1", port.ToString() }, RedirectStandardInput = true })!;
    using var fixtureConnection = await listener.AcceptTcpClientAsync();
    var fixturePort = ((IPEndPoint)fixtureConnection.Client.RemoteEndPoint!).Port;
    Check(MacPeer.IsSpotify(fixturePort, port, fakeSpotify), "Real client process could not be verified");
    Check(!MacPeer.IsSpotify(fixturePort, port, exe), "Process accepted from unselected bundle");
    child.Kill(); child.WaitForExit();
}
finally { store.Delete("claude-key.dat"); Directory.Delete(root, true); }
Console.WriteLine($"{passed} macOS helper checks passed");
