using System.Diagnostics;

namespace QueueCompanion;

// The native broker owns Keychain access. Secrets travel over anonymous pipes,
// never command-line arguments, environment variables or diagnostic logs.
public static class MacSecrets
{
    public static byte[] Run(string operation, string account, byte[]? value = null)
    {
        var info = new ProcessStartInfo(Path.Combine(AppContext.BaseDirectory, "QueueCompanion.Keychain"))
        { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        info.ArgumentList.Add(operation); info.ArgumentList.Add(account);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Could not open macOS Keychain.");
        using var output = new MemoryStream();
        var read = process.StandardOutput.BaseStream.CopyToAsync(output);
        var error = process.StandardError.ReadToEndAsync();
        if (value != null) process.StandardInput.BaseStream.Write(value);
        process.StandardInput.Close();
        if (!process.WaitForExit(30_000)) { process.Kill(); throw new InvalidOperationException("Keychain access timed out. Unlock your login Keychain and retry."); }
        read.GetAwaiter().GetResult(); error.GetAwaiter().GetResult();
        if (process.ExitCode != 0 || output.Length > 256_000) throw new InvalidOperationException("macOS Keychain access failed. Unlock your login Keychain and retry.");
        return output.ToArray();
    }
}
