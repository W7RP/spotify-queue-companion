using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Security.AccessControl;
using System.Security.Principal;

namespace QueueCompanion;

public sealed class Storage
{
    readonly object gate = new();
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public string Root { get; }
    public Storage(string? root = null)
    {
        Root = root ?? (OperatingSystem.IsMacOS()
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "Application Support", "QueueCompanion")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QueueCompanion"));
        Directory.CreateDirectory(Root);
        if (!OperatingSystem.IsWindows()) { File.SetUnixFileMode(Root, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute); return; }
        var owner = WindowsIdentity.GetCurrent().User!;
        var acl = new DirectorySecurity(); acl.SetOwner(owner); acl.SetAccessRuleProtection(true, false);
        foreach (var sid in new[] { owner, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
            acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(Root).SetAccessControl(acl);
    }
    public T? Read<T>(string name) => File.Exists(Path.Combine(Root, name)) ? JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(Root, name)), Json) : default;
    public void Write<T>(string name, T value) => Atomic(name, JsonSerializer.SerializeToUtf8Bytes(value, Json));
    public void Atomic(string name, byte[] bytes)
    {
        lock (gate) { var path = Path.Combine(Root, name); var temp = path + ".tmp";
        File.WriteAllBytes(temp, bytes);
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temp, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        File.Move(temp, path, true); }
    }
    public T? ReadSecret<T>(string name)
    {
        var path = Path.Combine(Root, name);
        if (!File.Exists(path)) return default;
        var raw = OperatingSystem.IsMacOS() ? MacSecrets.Run("get", Key(Root + ":" + name)) : Protect(File.ReadAllBytes(path), false);
        if (raw.Length == 0) return default;
        try { return JsonSerializer.Deserialize<T>(raw, Json); } finally { CryptographicOperations.ZeroMemory(raw); }
    }
    public void WriteSecret<T>(string name, T value)
    {
        var raw = JsonSerializer.SerializeToUtf8Bytes(value, Json);
        try
        {
            if (OperatingSystem.IsMacOS()) { MacSecrets.Run("set", Key(Root + ":" + name), raw); Atomic(name, "keychain-v1"u8.ToArray()); }
            else Atomic(name, Protect(raw, true));
        } finally { CryptographicOperations.ZeroMemory(raw); }
    }
    public void Delete(string name)
    {
        if (OperatingSystem.IsMacOS() && name.EndsWith(".dat", StringComparison.Ordinal)) MacSecrets.Run("delete", Key(Root + ":" + name));
        var p = Path.Combine(Root, name); if (File.Exists(p)) File.Delete(p);
    }
    public static string Key(string account) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(account))).ToLowerInvariant();
    [StructLayout(LayoutKind.Sequential)] struct Blob { public int Size; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true)] static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true)] static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    static byte[] Protect(byte[] bytes, bool encrypt)
    {
        var input = new Blob { Size = bytes.Length, Data = Marshal.AllocHGlobal(bytes.Length) };
        try
        {
            Marshal.Copy(bytes, 0, input.Data, bytes.Length);
            Blob output;
            var ok = encrypt ? CryptProtectData(ref input, "Queue Companion", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output)
                             : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok) throw new CryptographicException(Marshal.GetLastWin32Error());
            try { var result = new byte[output.Size]; Marshal.Copy(output.Data, result, 0, result.Length); return result; }
            finally { LocalFree(output.Data); }
        }
        finally { Marshal.FreeHGlobal(input.Data); }
    }
}

public record Settings(int Length = 15, int Cap = 50, string Mode = "append", string? Model = null, bool History = true, string Provider = "claude", string? ClaudeModel = null);
public record Pairing(string Token, int Port = 43829, int V = 1);
public record Registration(string ClientId, string Subject, string Email, string? IdToken, string? AccessToken, string? RefreshToken, string[] Scopes, DateTimeOffset Expires, DateTimeOffset EarliestRefresh);
public record Track(string Id, string Uri, string Title, string Artist, string Source = "catalogue");
public record ModelChoice(string Slug, string DisplayName, string? Line = null);
public record Generation(string Prompt, int Count, Track[] Candidates, bool Restricted, SongSuggestion[]? Previous = null, int Reserve = 0, SongSuggestion[]? Seeds = null, int PlaylistCount = 0, string[]? PlaylistIds = null);
public record Selection(string[] Ids, SongSuggestion[]? Suggestions, long GenerationMs, int RejectedSuggestions = 0, int ExtraChoices = 0);
public record SongSuggestion(string Title, string Artist);
