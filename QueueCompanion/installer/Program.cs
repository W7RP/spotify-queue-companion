using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using Microsoft.Win32;
using QueueCompanion;

namespace QueueCompanion.Setup;

internal static class Program
{
    internal static readonly string InstallRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "QueueCompanion");
    [STAThread] static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        if (args.Contains("--uninstall") && !args.Contains("--temporary") && Environment.ProcessPath!.StartsWith(InstallRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            var temporary = Path.Combine(Path.GetTempPath(), "QueueCompanion-Uninstall-" + Guid.NewGuid() + ".exe");
            File.Copy(Environment.ProcessPath!, temporary);
            var launch=new ProcessStartInfo(temporary){UseShellExecute=true,WindowStyle=args.Contains("--silent")?ProcessWindowStyle.Hidden:ProcessWindowStyle.Normal};foreach(var a in args)launch.ArgumentList.Add(a);launch.ArgumentList.Add("--temporary");Process.Start(launch);
            return;
        }
        Application.Run(new SetupForm(args));
        if(args.Contains("--temporary"))CleanupTemporaryCopy();
    }
    static void CleanupTemporaryCopy()
    {
        var file=Path.GetFullPath(Environment.ProcessPath!);var temp=Path.GetFullPath(Path.GetTempPath());
        if(!file.StartsWith(temp+"QueueCompanion-Uninstall-",StringComparison.OrdinalIgnoreCase)||Path.GetExtension(file)!=".exe")return;
        var command="$taskProcess = Get-Process -Id "+Environment.ProcessId+" -ErrorAction SilentlyContinue; if ($taskProcess) { $taskProcess.WaitForExit() }; Remove-Item -LiteralPath '"+file.Replace("'","''")+"' -Force -ErrorAction SilentlyContinue";
        var info=new ProcessStartInfo("powershell.exe"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};foreach(var a in new[]{"-NoProfile","-NonInteractive","-Command",command})info.ArgumentList.Add(a);Process.Start(info);
    }
}

sealed class SetupForm : Form
{
    readonly Label title = new() { Text = "Queue Companion", Font = new Font("Segoe UI", 22, FontStyle.Bold), AutoSize = true };
    readonly Label copy = new() { AutoSize = false, Width = 470, Height = 185, Font = new Font("Segoe UI", 10), Text = "Add a small music request bar inside Spotify.\n\nThis installs Spicetify 3.0.0-rc.3, an unofficial tool that modifies Spotify’s desktop files. Spotify is restarted during setup. Your current Spotify app files are backed up first.\n\nSpotify Premium and consent to eligible ChatGPT plan usage are required for the initial supported experience. No Spotify developer application is needed.\n\nThe helper runs invisibly. Open its settings inside Spotify to connect ChatGPT." };
    readonly Label progress = new() { AutoSize = false, Width = 470, Height = 60 };
    readonly Button action = new() { Text = "Install", Width = 140, Height = 34 };
    readonly Button close = new() { Text = "Close", Width = 100, Height = 34 };
    readonly Button restore = new() { Text = "Restore stock Spotify", Width = 170, Height = 34 };
    readonly Button browse = new() { Text = "Browse for Spotify", Width = 170, Height = 30 };
    readonly string[] args;
    readonly string dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QueueCompanion");
    readonly string spiceRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Spicetify");
    SpotifyInstallation? spotify;
    string spotifyRoot => spotify?.DataDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Spotify");
    string SpotifyExe => spotify?.Executable ?? Path.Combine(spotifyRoot, "Spotify.exe");
    string HelperExe => Path.Combine(Program.InstallRoot, "QueueCompanion.exe");
    string SpiceExe => Path.Combine(Program.InstallRoot, "vendor", "spicetify.exe");
    record Receipt(bool OwnSpicetify, string SpotifyVersion, string SpicetifyVersion, DateTimeOffset Installed, string? OriginalConfig, string? OriginalRun, SpotifyInstallation? Spotify = null);
    Receipt? receipt;
    bool revocationUnconfirmed;
    public SetupForm(string[] args)
    {
        this.args = args; Text = "Queue Companion Setup"; ClientSize = new Size(530, 450); FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen;
        title.Location = new Point(28, 25);copy.Location=new Point(28,80);progress.Location=new Point(28,270);browse.Location=new Point(28,340);action.Location=new Point(28,395);restore.Location=new Point(180,395);close.Location=new Point(400,395);
        Controls.AddRange([title, copy, progress, browse, action, restore, close]);close.Click+=(_,_)=>Close();action.Click+=async(_,_)=>await Execute();restore.Click+=async(_,_)=>await Restore();browse.Click+=(_,_)=>BrowseSpotify();
        var file = Path.Combine(dataRoot,"install.json");if(File.Exists(file))receipt=JsonSerializer.Deserialize<Receipt>(File.ReadAllText(file));
        spotify=receipt?.Spotify??SpotifyLocator.Find();
        browse.Visible=!args.Contains("--uninstall")&&!args.Contains("--restore");
        if(args.Contains("--uninstall")){action.Text="Uninstall";copy.Text="Remove Queue Companion and its invisible helper.\n\nChatGPT renewable credentials are revoked when the network is available and erased locally. Local listening counts, caches and pairing data are removed.\n\nIf Queue Companion installed Spicetify, Spotify’s stock files are restored. If Spicetify was already installed, the Queue Companion module is removed while your other modules are preserved.\n\nSpotify will restart. Your playlists and liked songs are never deleted.";restore.Visible=false;}
        else if(receipt!=null){action.Text="Repair";copy.Text="Repair the Queue Companion bar after a Spotify update or reconnect the helper.\n\nThis reapplies the pinned Spicetify integration and restarts Spotify. Existing ChatGPT credentials remain protected and your library is unchanged.\n\nReplacement is enabled only for the Spotify build whose removal semantics were tested. On other builds, use append until compatibility has been verified.\n\nRestore stock Spotify removes the modified interface and leaves your protected connection available for repair.";}
        else restore.Visible=false;
        if(args.Contains("--restore"))action.Text="Restore";
        if(args.Contains("--silent"))Shown+=async(_,_)=>{await Execute();Close();};
    }
    void Report(string text){if(InvokeRequired)BeginInvoke(()=>Report(text));else progress.Text=text;}
    void BrowseSpotify()
    {
        using var picker=new OpenFileDialog { Title="Choose Spotify.exe", Filter="Spotify application (Spotify.exe)|Spotify.exe", CheckFileExists=true, InitialDirectory=Path.GetDirectoryName(SpotifyExe) };
        if(picker.ShowDialog(this)!=DialogResult.OK)return;
        var path=SpotifyLocator.Normalize(picker.FileName);
        if(path!=null&&SpotifyInstallation.IsStorePath(path)){Report("This is the Microsoft Store installation. Use the desktop Spotify download; Store support has not been validated.");return;}
        var selected=path==null?null:SpotifyLocator.Inspect(path);
        if(selected==null){Report("Choose the installed Spotify.exe, not SpotifySetup.exe. Open Spotify and sign in once so its app files are present, then retry.");return;}
        spotify=selected;Report("Spotify found. Choose Install or Repair to continue.");
    }
    async Task Execute()
    {
        action.Enabled=false;restore.Enabled=false;close.Enabled=false;browse.Enabled=false;
        try {if(args.Contains("--uninstall"))await Uninstall();else if(args.Contains("--restore"))await RestoreCore();else await Install();Report(args.Contains("--uninstall")?"Queue Companion was removed."+(revocationUnconfirmed?" Also revoke Queue Companion in ChatGPT settings: network revocation could not be confirmed.":""):args.Contains("--restore")?"Stock Spotify restored. Use Repair to reinstall the bar.":"Installed. Use the small bar below Spotify’s search. Open its gear to connect ChatGPT.");SaveReport(0,null);Environment.ExitCode=0;}
        catch(Exception e){SaveReport(1,e.Message);Report("Setup could not finish: "+e.Message+"\nUse Repair to retry. Your backup is retained.");Environment.ExitCode=1;action.Enabled=true;restore.Enabled=true;}
        finally{close.Enabled=true;browse.Enabled=true;}
    }
    async Task Install()
    {
        var selected=SpotifyLocator.Find(spotify?.Executable);
        if(selected==null)throw new InvalidOperationException("Spotify could not be located. Open Spotify and keep it running, then retry, or choose Browse for Spotify and select the installed Spotify.exe.");
        if(receipt?.Spotify!=null&&!string.Equals(receipt.Spotify.DataDirectory,selected.DataDirectory,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("A different Spotify installation was selected. Restore the previous installation before switching copies.");
        spotify=selected;
        Directory.CreateDirectory(dataRoot);OwnerOnly(dataRoot);Directory.CreateDirectory(Program.InstallRoot);
        var apps=Path.Combine(spotifyRoot,"Apps");
        if(receipt==null)
        {
            Report("Saving your Spotify and Spicetify setup…");
            var existed=File.Exists(Path.Combine(spiceRoot,"config.toml"));
            var proofOwned=File.Exists(Path.Combine(spiceRoot,"queue-companion-proof-owner"));
            var original=existed&&!proofOwned?File.ReadAllText(Path.Combine(spiceRoot,"config.toml")):null;
            var version=FileVersionInfo.GetVersionInfo(SpotifyExe).ProductVersion??"unknown";
            receipt=new(!existed||proofOwned,version,"3.0.0-rc.3",DateTimeOffset.UtcNow,original,null,spotify);
            var backup=Path.Combine(dataRoot,"backup");Directory.CreateDirectory(backup);
            // Stock archive is already preserved by v3 when a proof installation is adopted.
            var stock=File.Exists(Path.Combine(apps,"xpui.spa.backup"))?Path.Combine(apps,"xpui.spa.backup"):Path.Combine(apps,"xpui.spa");
            if(File.Exists(stock))File.Copy(stock,Path.Combine(backup,"xpui.spa"),true);
            if(File.Exists(Path.Combine(apps,"login.spa")))File.Copy(Path.Combine(apps,"login.spa"),Path.Combine(backup,"login.spa"),true);
            File.WriteAllText(Path.Combine(dataRoot,"install.json"),JsonSerializer.Serialize(receipt));
        }
        if(receipt.Spotify==null){receipt=receipt with { Spotify=spotify };File.WriteAllText(Path.Combine(dataRoot,"install.json"),JsonSerializer.Serialize(receipt));}
        File.WriteAllText(Path.Combine(dataRoot,"spotify-installation.json"),JsonSerializer.Serialize(spotify,new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        StopOwned("QueueCompanion", Program.InstallRoot);
        StopOwned("spicetify-daemon", Program.InstallRoot);
        Report("Installing the invisible helper and bundled runtimes…");
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("QueueCompanion.Setup.payload.zip")??throw new InvalidOperationException("Installer payload missing."))
        using(var zip=new ZipArchive(stream))
        {
            foreach(var entry in zip.Entries)
            {
                var path=Path.GetFullPath(Path.Combine(Program.InstallRoot,entry.FullName));RequireInside(path,Program.InstallRoot);
                if(string.IsNullOrEmpty(entry.Name)){Directory.CreateDirectory(path);continue;}
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);entry.ExtractToFile(path,true);
            }
        }
        var setup=Path.Combine(Program.InstallRoot,"QueueCompanion.Setup.exe");
        if(!string.Equals(Environment.ProcessPath,setup,StringComparison.OrdinalIgnoreCase))File.Copy(Environment.ProcessPath!,setup,true);
        Directory.CreateDirectory(spiceRoot);
        if(receipt.OwnSpicetify)
        {
            // JSON-quoted strings also form valid TOML basic strings, including apostrophes and backslashes.
            var toml=$"mirror = false\ndaemon = true\nauto_update = false\nspotify_data_dir = {JsonSerializer.Serialize(spotifyRoot)}\nspotify_exec = {JsonSerializer.Serialize(SpotifyExe)}\noffline_bnk_dir = {JsonSerializer.Serialize(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Spotify"))}\n";
            File.WriteAllText(Path.Combine(spiceRoot,"config.toml"),toml);
            foreach(var directory in new[]{"store","modules","classmaps","cache"})CopyTree(Path.Combine(Program.InstallRoot,"vendor","runtime",directory),Path.Combine(spiceRoot,directory));
        }
        var module=Path.Combine(spiceRoot,"modules","queue-companion");CopyTree(Path.Combine(Program.InstallRoot,"extension"),module);
        await Run(HelperExe,["--init","--extension-dir",module]);OwnerOnly(module);
        Report("Applying Spicetify to Spotify. Spotify will restart…");
        await RunSpice(["apply"],120_000);
        var manifest=Path.Combine(apps,"xpui","modules","manifest.json");
        if(!File.Exists(manifest)||!File.ReadAllText(manifest).Contains("queue-companion"))throw new InvalidOperationException("Spicetify did not stage Queue Companion. The backup is available for restore.");
        OwnerOnly(Path.Combine(apps,"xpui","modules","queue-companion"));
        using(var run=Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run"))run.SetValue("Queue Companion","\""+HelperExe+"\"");
        using(var key=Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QueueCompanion"))
        {key.SetValue("DisplayName","Queue Companion");key.SetValue("DisplayVersion","0.1.1");key.SetValue("Publisher","Queue Companion contributors");key.SetValue("InstallLocation",Program.InstallRoot);key.SetValue("UninstallString","\""+setup+"\" --uninstall");key.SetValue("NoModify",1);key.SetValue("NoRepair",0);}
        using(var protocol=Registry.CurrentUser.CreateSubKey("Software\\Classes\\queue-companion")) {protocol.SetValue("", "URL:Queue Companion");protocol.SetValue("URL Protocol","");}
        using(var command=Registry.CurrentUser.CreateSubKey("Software\\Classes\\queue-companion\\shell\\open\\command"))command.SetValue("","\""+HelperExe+"\" \"%1\"");
        Shortcut("Queue Companion",HelperExe,null);Shortcut("Queue Companion Setup",setup,null);Shortcut("Uninstall Queue Companion",setup,"--uninstall");
        Process.Start(new ProcessStartInfo(HelperExe){UseShellExecute=false,CreateNoWindow=true});
    }
    async Task Restore()
    {
        action.Enabled=false;restore.Enabled=false;close.Enabled=false;browse.Enabled=false;
        try{await RestoreCore();Report("Stock Spotify restored. Use Repair to reinstall the bar.");}
        catch(Exception e){Report("Restore failed: "+e.Message);}finally{action.Enabled=true;restore.Enabled=true;close.Enabled=true;browse.Enabled=true;}
    }
    async Task RestoreCore(){Report("Restoring stock Spotify…");var apps=Path.Combine(spotifyRoot,"Apps");if(File.Exists(Path.Combine(apps,"xpui.spa"))&&!Directory.Exists(Path.Combine(apps,"xpui")))return;await RunSpice(["restore"],120_000);}
    Task<int> RunSpice(string[] arguments,int timeout) => Run(SpiceExe,["--spotify-exec",SpotifyExe,"--spotify-data-dir",spotifyRoot,..arguments],timeout);
    void SaveReport(int exitCode,string? error)
    {var path=args.SkipWhile(a=>a!="--report").Skip(1).FirstOrDefault();if(path!=null)File.WriteAllText(path,JsonSerializer.Serialize(new{exitCode,error,step=progress.Text,at=DateTimeOffset.UtcNow}));}
    async Task Uninstall()
    {
        Report("Removing helper and connection…");StopOwned("QueueCompanion",Program.InstallRoot);
        if(File.Exists(HelperExe)){var result=await Run(HelperExe,["--revoke"],25_000,false);revocationUnconfirmed=result!=0;}
        var module=Path.Combine(spiceRoot,"modules","queue-companion");if(Directory.Exists(module))DeleteOwnedTree(module,spiceRoot);
        Report("Restoring your Spotify interface…");
        if(File.Exists(SpiceExe)){if(receipt?.OwnSpicetify==true)await RestoreCore();else await RunSpice(["apply"],120_000);}
        if(receipt?.OwnSpicetify==true)
        {
            await Run(SpiceExe,["daemon","uninstall"],30_000,false);StopOwned("spicetify-daemon",Program.InstallRoot);
            // Remove only the Spicetify installation recorded as created by Queue Companion.
            RequireInside(spiceRoot,Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
            if(Directory.Exists(spiceRoot))DeleteOwnedTree(spiceRoot,Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
        }
        else if(receipt?.OriginalConfig!=null)File.WriteAllText(Path.Combine(spiceRoot,"config.toml"),receipt.OriginalConfig);
        using(var run=Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run",true))run?.DeleteValue("Queue Companion",false);
        Registry.CurrentUser.DeleteSubKeyTree("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QueueCompanion",false);
        Registry.CurrentUser.DeleteSubKeyTree("Software\\Classes\\queue-companion",false);
        var menus=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Queue Companion");if(Directory.Exists(menus))DeleteOwnedTree(menus,Environment.GetFolderPath(Environment.SpecialFolder.Programs));
        // Remove this product's local receipt, backups, history, caches and protected credentials.
        if(Directory.Exists(dataRoot))DeleteOwnedTree(dataRoot,Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
        if(Directory.Exists(Program.InstallRoot))DeleteOwnedTree(Program.InstallRoot,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs"));
    }
    static async Task<int> Run(string exe,string[] arguments,int timeout=30_000,bool throwOnError=true)
    {
        var info=new ProcessStartInfo(exe){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardOutput=true,RedirectStandardError=true};foreach(var a in arguments)info.ArgumentList.Add(a);
        using var p=Process.Start(info)??throw new InvalidOperationException("Could not start integration tool.");
        var output=p.StandardOutput.ReadToEndAsync();var error=p.StandardError.ReadToEndAsync();
        using var deadline=new CancellationTokenSource(timeout);try{await p.WaitForExitAsync(deadline.Token);}catch(OperationCanceledException){p.Kill();throw new InvalidOperationException("Integration tool timed out. Your backup is retained.");}
        // The Spicetify daemon may inherit pipe handles. Do not wait on descendant lifetimes.
        if(p.ExitCode!=0&&throwOnError)throw new InvalidOperationException($"{Path.GetFileName(exe)} exited with {p.ExitCode}. Run Repair; detailed integration output is not logged with credentials.");
        return p.ExitCode;
    }
    static void StopOwned(string name,string root)
    {
        foreach(var p in Process.GetProcessesByName(name)){try{var file=p.MainModule?.FileName;if(file!=null&&file.StartsWith(Path.GetFullPath(root)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)){p.Kill();p.WaitForExit(5000);}}catch{}finally{p.Dispose();}}
    }
    static void RequireInside(string path,string root)
    {var full=Path.GetFullPath(path);var prefix=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Path escaped the intended install directory.");}
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool RemoveDirectory(string path);
    static void DeleteOwnedTree(string path,string boundary)
    {
        RequireInside(path,boundary);var attributes=File.GetAttributes(path);
        if((attributes&FileAttributes.Directory)!=0)
        {
            // Delete links themselves before their targets. Never traverse a junction outside the product tree.
            if((attributes&FileAttributes.ReparsePoint)!=0){if(!RemoveDirectory(path)){var error=Marshal.GetLastWin32Error();if(error is not (2 or 3))throw new System.ComponentModel.Win32Exception(error);}return;}
            foreach(var child in Directory.GetFileSystemEntries(path).OrderBy(p=>(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0?0:1))DeleteOwnedTree(child,boundary);
            File.SetAttributes(path,attributes&~FileAttributes.ReadOnly);Directory.Delete(path,false);
        }
        else{File.SetAttributes(path,attributes&~FileAttributes.ReadOnly);File.Delete(path);}
    }
    static void OwnerOnly(string directory)
    {
        var owner=WindowsIdentity.GetCurrent().User!;var acl=new DirectorySecurity();acl.SetOwner(owner);acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));new DirectoryInfo(directory).SetAccessControl(acl);
    }
    static void CopyTree(string source,string destination)
    {if(!Directory.Exists(source))return;Directory.CreateDirectory(destination);foreach(var file in Directory.GetFiles(source)){var name=Path.GetFileName(file);if(name=="daemon-token"||name=="queue-companion-pairing.js")continue;File.Copy(file,Path.Combine(destination,name),true);}foreach(var sub in Directory.GetDirectories(source)){CopyTree(sub,Path.Combine(destination,Path.GetFileName(sub)));}}
    static void Shortcut(string label,string target,string? arguments)
    {
        var folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Queue Companion");Directory.CreateDirectory(folder);
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")!)!;dynamic link=shell.CreateShortcut(Path.Combine(folder,label+".lnk"));link.TargetPath=target;link.WorkingDirectory=Program.InstallRoot;link.Arguments=arguments??"";link.Save();
    }
}

