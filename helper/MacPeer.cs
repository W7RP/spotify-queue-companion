using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace QueueCompanion;

public static class MacPeer
{
    [DllImport("/usr/lib/libproc.dylib")] static extern int proc_pidpath(int pid, byte[] buffer, uint size);
    [DllImport("/usr/lib/libSystem.B.dylib")] static extern IntPtr realpath(string path, IntPtr resolved);
    [DllImport("/usr/lib/libSystem.B.dylib")] static extern void free(IntPtr pointer);
    static string? Canonical(string path)
    {
        var pointer = realpath(path, IntPtr.Zero);
        if (pointer == IntPtr.Zero) return null;
        try { return Marshal.PtrToStringUTF8(pointer); } finally { free(pointer); }
    }
    public static bool IsSpotify(int peerPort, int servicePort, string? expected)
    {
        if (expected == null) return false;
        try
        {
            var info = new ProcessStartInfo("/usr/sbin/lsof") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var arg in new[] { "-nP", "-a", "-iTCP:" + servicePort, "-sTCP:ESTABLISHED", "-Fpn" }) info.ArgumentList.Add(arg);
            using var process = Process.Start(info)!;
            var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(3_000)) { process.Kill(); return false; }
            var result = output.GetAwaiter().GetResult(); error.GetAwaiter().GetResult();
            if (process.ExitCode != 0 || result.Length > 128_000) return false;
            var expectedPath = Canonical(expected); if (expectedPath == null) return false;
            int pid = 0;
            foreach (var line in result.Split('\n'))
            {
                if (line.StartsWith('p')) { int.TryParse(line.AsSpan(1), out pid); continue; }
                if (pid == 0 || line != $"n127.0.0.1:{peerPort}->127.0.0.1:{servicePort}") continue;
                var buffer = new byte[4096]; if (proc_pidpath(pid, buffer, (uint)buffer.Length) <= 0) return false;
                var actual = Canonical(Encoding.UTF8.GetString(buffer, 0, Array.IndexOf(buffer, (byte)0)));
                return SpotifyInstallation.MatchesMacPeer(actual, expectedPath);
            }
        }
        catch { }
        return false;
    }
}
