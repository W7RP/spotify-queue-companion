using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using QueueCompanion;

var store = new Storage();
var pairing = store.Read<Pairing>("pairing.json") ?? new Pairing(OAuth.Random()); store.Write("pairing.json", pairing);
var executable = Environment.ProcessPath!;
if (args.Any(x => x.Equals("queue-companion://repair/", StringComparison.OrdinalIgnoreCase) || x.Equals("queue-companion://repair", StringComparison.OrdinalIgnoreCase)))
{
    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(AppContext.BaseDirectory, "QueueCompanion.Setup.exe")) { UseShellExecute = true }); return;
}
if (args.Contains("--revoke"))
{
    store.Delete("claude-key.dat");
    using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(15) };
    try { await new OAuth(store, client).Disconnect(); } catch { Environment.ExitCode = 2; }
    return;
}
if (args.Contains("--verify-inference"))
{
    using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(45) };
    var verificationAuth = new OAuth(store, client);
    var verificationProvider = new ChatGptProvider(verificationAuth, client);
    var reportPath = args.SkipWhile(x => x != "--report").Skip(1).First();
    try
    {
        var models = await verificationProvider.Models(default);
        var selection = await verificationProvider.Select(new Generation("Select one mellow song for work. Return a real song suggestion.", 1, [], false), null, default);
        File.WriteAllText(reportPath, JsonSerializer.Serialize(new { passed = true, models = models.Select(m => m.Slug), selection }, Storage.Json));
    }
    catch (Exception e) { File.WriteAllText(reportPath, JsonSerializer.Serialize(new { passed = false, error = e.Message }, Storage.Json)); }
    return;
}
if (args.Contains("--init"))
{
    // Only the pairing credential is passed to Spotify, never OAuth credentials.
    var extension = args.SkipWhile(x => x != "--extension-dir").Skip(1).FirstOrDefault();
    if (extension != null)
    {
        Directory.CreateDirectory(extension);
        var script = "window.__queueCompanionPairing=" + JsonSerializer.Serialize(pairing, Storage.Json) + ";\n";
        File.WriteAllText(Path.Combine(extension, "queue-companion-pairing.js"), script);
    }
    return;
}
if (args.Contains("--forget")) { store.Delete("credentials.dat"); store.Delete("claude-key.dat"); return; }
using var singleton = new Mutex(true, "Local\\QueueCompanion-" + Storage.Key(Environment.UserName), out var first);
if (!first) return;
using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(45) };
var oauth = new OAuth(store, http); IProvider chatGpt = new ChatGptProvider(oauth, http); var claude = new ClaudeProvider(store, http); var history = new History(store);
IProvider Provider(string name) => name switch { "claude" => claude, "chatgpt" => chatGpt, _ => throw new InvalidOperationException("Choose Claude API or ChatGPT in settings.") };
var builder = WebApplication.CreateSlimBuilder(Array.Empty<string>());
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(o => { o.Listen(IPAddress.Loopback, pairing.Port); o.Limits.MaxRequestBodySize = 256_000; });
var app = builder.Build(); app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
app.Use(async (context, next) =>
{
    if (context.Request.Host.Value != $"127.0.0.1:{pairing.Port}" || context.Connection.RemoteIpAddress == null || !IPAddress.IsLoopback(context.Connection.RemoteIpAddress)) { context.Response.StatusCode = 403; return; }
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    await next();
});
app.MapGet("/auth/callback", async context =>
{
    context.Response.ContentType = "text/html; charset=utf-8";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
    string message;
    try { await oauth.Complete(context.Request.Query); message = "Queue Companion is connected. Return to Spotify. You can close this tab."; }
    catch { context.Response.StatusCode = 400; message = "Queue Companion could not finish sign-in. Return to Spotify settings and try again."; }
    await context.Response.WriteAsync("<!doctype html><title>Queue Companion</title><p>" + message + "</p>");
});
app.Map("/v1", async context =>
{
    if (!context.WebSockets.IsWebSocketRequest || context.Request.Headers.Origin != "https://xpui.app.spotify.com" || !Peer.IsSpotify(context.Connection.RemotePort, pairing.Port, store.Read<SpotifyInstallation>("spotify-installation.json")?.Executable)) { context.Response.StatusCode = 403; return; }
    using var ws = await context.WebSockets.AcceptWebSocketAsync();
    using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    var sendLock = new SemaphoreSlim(1, 1); var active = new Dictionary<string, CancellationTokenSource>(); var activeGate = new object();
    async Task Send(object obj)
    {
        await sendLock.WaitAsync(lifetime.Token);
        try { if (ws.State == WebSocketState.Open) await ws.SendAsync(JsonSerializer.SerializeToUtf8Bytes(obj, Storage.Json), WebSocketMessageType.Text, true, lifetime.Token); }
        finally { sendLock.Release(); }
    }
    var authenticated = false; var tasks = new List<Task>();
    try
    {
        using var authDeadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); authDeadline.CancelAfter(TimeSpan.FromSeconds(5));
        var firstMessage = await Receive(ws, authDeadline.Token);
        if (firstMessage.GetProperty("v").GetInt32() != 1 || firstMessage.GetProperty("type").GetString() != "pair" || !OAuth.Fixed(firstMessage.GetProperty("token").GetString()!, pairing.Token)) { await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Pairing denied", lifetime.Token); return; }
        authenticated = true; await Send(new { v = 1, type = "paired" });
        while (ws.State == WebSocketState.Open)
        {
            var message = await Receive(ws, lifetime.Token);
            if (message.GetProperty("v").GetInt32() != 1) throw new InvalidOperationException("Unsupported protocol.");
            var id = message.GetProperty("id").GetString()!; if (id.Length > 100) throw new InvalidOperationException("Invalid request ID.");
            var type = message.GetProperty("type").GetString()!;
            if (type == "cancel") { lock (activeGate) { if (active.TryGetValue(id, out var running)) running.Cancel(); } continue; }
            CancellationTokenSource job;
            lock (activeGate) { if (active.Count >= 4 || active.ContainsKey(id)) throw new InvalidOperationException("Too many or duplicate requests."); job = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token); active[id] = job; }
            job.CancelAfter(TimeSpan.FromSeconds(type == "generate" ? 45 : 50));
            tasks.Add(Handle(message, id, type, job));
            tasks.RemoveAll(t => t.IsCompleted);
        }
    }
    catch (Exception) { /* Socket errors contain no logged payloads or credentials. */ }
    finally { lifetime.Cancel(); lock (activeGate) { foreach (var c in active.Values) c.Cancel(); } try { await Task.WhenAll(tasks); } catch { } sendLock.Dispose(); }
    async Task Handle(JsonElement m, string id, string type, CancellationTokenSource job)
    {
        try
        {
            if (!authenticated) throw new InvalidOperationException("Pairing required.");
            var data = m.TryGetProperty("data", out var d) ? d : default;
            var settings = store.Read<Settings>("settings.json") ?? new Settings();
            string Account() { var a = data.GetProperty("account").GetString()!; if (a.Length is < 1 or > 200) throw new InvalidOperationException("Invalid Spotify account partition."); return a; }
            object? result = type switch
            {
                "status" => new { auth = oauth.Status(), claude = claude.Status(), settings, protocol = 1, history = history.Status(Account()), quota = settings.Provider == "claude" ? "Uses Anthropic API credits. Exact remaining balance is unavailable here." : "Exact remaining quota is unavailable; usage errors come from ChatGPT." },
                "connect" => oauth.Start(pairing.Port, data.TryGetProperty("newAccount", out var na) && na.GetBoolean()),
                "disconnect" => await Disconnect(),
                "claude.connect" => await claude.Connect(data.GetProperty("apiKey").GetString()!, job.Token),
                "claude.disconnect" => claude.Disconnect(),
                "models" => await Provider(data.ValueKind == JsonValueKind.Object && data.TryGetProperty("provider", out var requestedProvider) ? requestedProvider.GetString()! : settings.Provider).Models(job.Token),
                "generate" => await Provider(settings.Provider).Select(JsonSerializer.Deserialize<Generation>(data, Storage.Json)!, settings.Provider == "claude" ? settings.ClaudeModel : settings.Model, job.Token),
                "settings" => SaveSettings(data),
                "observe" => Observe(data),
                "history" => history.Rank(Account(), Math.Clamp(data.GetProperty("count").GetInt32(), 1, 50), data.TryGetProperty("days", out var days) ? days.GetInt32() : 30),
                "history.clear" => ClearHistory(Account()),
                "cache.get" => CacheGet(Account(), data),
                "cache.put" => CachePut(Account(), data),
                _ => throw new InvalidOperationException("Unknown operation.")
            };
            await Send(new { v = 1, id, ok = true, data = result });
        }
        catch (OperationCanceledException) { try { await Send(new { v = 1, id, ok = false, error = "Selection was cancelled or timed out. Nothing was queued." }); } catch { } }
        catch (Exception e) { try { await Send(new { v = 1, id, ok = false, error = e is InvalidOperationException ? e.Message : "Request failed. Check your connection and try again." }); } catch { } }
        finally { lock (activeGate) active.Remove(id); job.Dispose(); }
    }
    async Task<object> Disconnect() { await oauth.Disconnect(); return new { disconnected = true }; }
    object SaveSettings(JsonElement data)
    {
        var s = JsonSerializer.Deserialize<Settings>(data, Storage.Json)!;
        if (s.Cap is < 1 or > 50 || s.Length < 1 || s.Length > s.Cap || s.Mode is not ("append" or "replace") || s.Provider is not ("claude" or "chatgpt") || s.Model?.Length > 100 || s.ClaudeModel?.Length > 100) throw new InvalidOperationException("Invalid settings.");
        store.Write("settings.json", s); return s;
    }
    object Observe(JsonElement data) { if ((store.Read<Settings>("settings.json") ?? new Settings()).History) history.Observe(data.GetProperty("account").GetString()!, JsonSerializer.Deserialize<Listen>(data.GetProperty("listen"), Storage.Json)!, data.GetProperty("duration").GetInt32()); return new { recorded = true }; }
    object ClearHistory(string account) { history.Clear(account); return new { cleared = true }; }
    object? CacheGet(string account, JsonElement data)
    {
        var key = Storage.Key(data.GetProperty("key").GetString()!);
        var item = store.Read<CacheItem>($"cache-{Storage.Key(account)}-{key}.json");
        return item != null && item.Expires > DateTimeOffset.UtcNow ? item.Value : null;
    }
    object CachePut(string account, JsonElement data)
    {
        var key = Storage.Key(data.GetProperty("key").GetString()!); var ttl = Math.Clamp(data.GetProperty("ttl").GetInt32(), 1, 900);
        store.Write($"cache-{Storage.Key(account)}-{key}.json", new CacheItem(DateTimeOffset.UtcNow.AddSeconds(ttl), data.GetProperty("value").Clone()));
        // Expired cache files are removed opportunistically; keep a bounded working set.
        foreach (var old in Directory.GetFiles(store.Root, "cache-*.json").OrderByDescending(File.GetLastWriteTimeUtc).Skip(256)) File.Delete(old);
        return new { cached = true };
    }
});
if (args.Contains("--connect")) app.Lifetime.ApplicationStarted.Register(() => oauth.Start(pairing.Port));
await app.RunAsync();

static async Task<JsonElement> Receive(WebSocket ws, CancellationToken ct)
{
    using var stream = new MemoryStream(); var buffer = new byte[8192];
    WebSocketReceiveResult result;
    do
    {
        result = await ws.ReceiveAsync(buffer, ct);
        if (result.MessageType != WebSocketMessageType.Text) throw new InvalidOperationException("Text protocol required.");
        stream.Write(buffer, 0, result.Count); if (stream.Length > 256_000) throw new InvalidOperationException("Message too large.");
    } while (!result.EndOfMessage);
    using var parsed = JsonDocument.Parse(stream.ToArray()); return parsed.RootElement.Clone();
}
record CacheItem(DateTimeOffset Expires, JsonElement Value);
