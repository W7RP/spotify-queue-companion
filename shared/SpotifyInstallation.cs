namespace QueueCompanion;

public sealed record SpotifyInstallation(string Executable, string DataDirectory)
{
    public static bool IsStorePath(string path) => path.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(part => part.Equals("WindowsApps", StringComparison.OrdinalIgnoreCase) || part.StartsWith("SpotifyAB.SpotifyMusic_", StringComparison.OrdinalIgnoreCase));
    public static bool MatchesPeer(string? actual, string expected)
    {
        if (actual == null || !Path.IsPathFullyQualified(actual) || !Path.IsPathFullyQualified(expected) || IsStorePath(expected)) return false;
        try { return Path.GetFileName(expected).Equals("Spotify.exe", StringComparison.OrdinalIgnoreCase) && Path.GetFullPath(actual).Equals(Path.GetFullPath(expected), StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }
}
