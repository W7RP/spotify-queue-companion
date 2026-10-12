using System.Diagnostics;
using System.Runtime.InteropServices;

namespace QueueCompanion;

public static class Peer
{
    [DllImport("iphlpapi.dll", SetLastError = true)] static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int family, int kind, uint reserved);
    [StructLayout(LayoutKind.Sequential)] struct Row { public uint State, LocalAddress, LocalPort, RemoteAddress, RemotePort, Pid; }
    public static bool IsSpotify(int peerPort, int servicePort, string? selectedExecutable = null)
    {
        if (OperatingSystem.IsMacOS()) return MacPeer.IsSpotify(peerPort, servicePort, selectedExecutable);
        if (!OperatingSystem.IsWindows()) return false;
        int size = 0; GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 5, 0);
        var table = Marshal.AllocHGlobal(size);
        try
        {
            if (GetExtendedTcpTable(table, ref size, false, 2, 5, 0) != 0) return false;
            int count = Marshal.ReadInt32(table); int rowSize = Marshal.SizeOf<Row>();
            for (var i = 0; i < count; i++)
            {
                var row = Marshal.PtrToStructure<Row>(IntPtr.Add(table, 4 + i * rowSize));
                static int Port(uint v) => (int)((v & 255) << 8 | (v >> 8 & 255));
                if (Port(row.LocalPort) != peerPort || Port(row.RemotePort) != servicePort || row.LocalAddress != 0x0100007f || row.RemoteAddress != 0x0100007f) continue;
                try
                {
                    using var process = Process.GetProcessById((int)row.Pid);
                    var path = process.MainModule?.FileName;
                    var expected = selectedExecutable ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Spotify", "Spotify.exe");
                    return SpotifyInstallation.MatchesPeer(path, expected);
                }
                catch { return false; }
            }
            return false;
        }
        finally { Marshal.FreeHGlobal(table); }
    }
}
