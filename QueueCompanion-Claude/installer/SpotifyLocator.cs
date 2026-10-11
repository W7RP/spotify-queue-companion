using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using QueueCompanion;

namespace QueueCompanion.Setup;

public static class SpotifyLocator
{
    public static SpotifyInstallation? Find(string? savedExecutable = null) => Select(Candidates(savedExecutable), Inspect);
    public static SpotifyInstallation? Select(IEnumerable<string> candidates, Func<string, SpotifyInstallation?> inspect)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in candidates)
        {
            var path = Normalize(candidate);
            if (path == null || !seen.Add(path) || SpotifyInstallation.IsStorePath(path)) continue;
            var result = inspect(path); if (result != null) return result;
        }
        return null;
    }
    public static string? Normalize(string candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate)) return null;
        var match = Regex.Match(candidate, "^\\s*(?:\"([^\"]+\\.exe)\"|(.+?\\.exe))(?:\\s*,\\s*-?\\d+)?\\s*$", RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        var path = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
        if (!Path.IsPathFullyQualified(path)) return null;
        try { return Path.GetFullPath(path); } catch { return null; }
    }
    public static SpotifyInstallation? Inspect(string executable)
    {
        try
        {
            if (SpotifyInstallation.IsStorePath(executable) || !File.Exists(executable) || !Path.GetFileName(executable).Equals("Spotify.exe", StringComparison.OrdinalIgnoreCase)) return null;
            var version = FileVersionInfo.GetVersionInfo(executable);
            if (!string.Equals(version.ProductName, "Spotify", StringComparison.OrdinalIgnoreCase) || !string.Equals(version.OriginalFilename, "Spotify.exe", StringComparison.OrdinalIgnoreCase)) return null;
            var parent = Path.GetDirectoryName(executable)!;
            var roaming = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Spotify");
            var data = new[] { parent, roaming }.FirstOrDefault(root => File.Exists(Path.Combine(root, "Apps", "xpui.spa")) || File.Exists(Path.Combine(root, "Apps", "xpui.spa.backup")) || File.Exists(Path.Combine(root, "Apps", "xpui", "index.html")));
            return data == null ? null : new(executable, data);
        }
        catch { return null; }
    }
    static IEnumerable<string> Candidates(string? saved)
    {
        if (saved != null) yield return saved;
        var running = new List<string>();
        foreach (var process in Process.GetProcessesByName("Spotify"))
        {
            try { if (process.MainModule?.FileName is { } path) running.Add(path); } catch { } finally { process.Dispose(); }
        }
        foreach (var path in running) yield return path;
        foreach (var folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"), Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) })
            if (!string.IsNullOrWhiteSpace(folder)) yield return Path.Combine(folder, "Spotify", "Spotify.exe");
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        foreach (var path in RegistryCandidates(hive, view)) yield return path;
    }
    static List<string> RegistryCandidates(RegistryHive hive, RegistryView view)
    {
        var result = new List<string>();
        try
        {
            using var root = RegistryKey.OpenBaseKey(hive, view);
            using var app = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\Spotify.exe");
            if (app?.GetValue("") is string path) result.Add(path);
            using var uninstall = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstall != null) foreach (var name in uninstall.GetSubKeyNames())
            {
                using var entry = uninstall.OpenSubKey(name);
                if (entry?.GetValue("DisplayName") is not string display || !display.Equals("Spotify", StringComparison.OrdinalIgnoreCase)) continue;
                if (entry.GetValue("InstallLocation") is string directory && !string.IsNullOrWhiteSpace(directory)) result.Add(Path.Combine(directory.Trim('"'), "Spotify.exe"));
                if (entry.GetValue("DisplayIcon") is string icon) result.Add(icon);
            }
        }
        catch { }
        return result;
    }
}
