using System.Net.Http.Json;
using System.Text.Json;

namespace QueueCompanion;

public sealed record MobileBridgeConfig(string Origin, string ServiceToken, string BridgeToken);

// Outbound HTTPS mailbox, using the SAME provider/OAuth instance as Spotify's
// desktop extension. OAuth credentials never enter the mailbox or phone browser.
public static class MobileBridge
{
    public static async Task<bool> Verify(Storage store)
    {
        var config = store.ReadSecret<MobileBridgeConfig>("mobile-bridge.dat");
        if (config == null) return false;
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(110) };
        using var request = new HttpRequestMessage(HttpMethod.Post, config.Origin + "/api/pc/verify") { Content = JsonContent.Create(new { }) };
        request.Headers.TryAddWithoutValidation("OAI-Sites-Authorization", "Bearer " + config.ServiceToken);
        request.Headers.Authorization = new("Bearer", config.BridgeToken);
        using var result = await http.SendAsync(request);
        if (!result.IsSuccessStatusCode) return false;
        using var json = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("passed").GetBoolean();
    }
    public static void Configure(Storage store, MobileBridgeConfig config)
    {
        if (!Uri.TryCreate(config.Origin, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Port != 443 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.UserInfo.Length != 0 || uri.IsLoopback || !uri.Host.EndsWith(".chatgpt.site", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Use the private Queue Companion Sites origin.");
        if (config.ServiceToken.Length is < 20 or > 8000 || config.ServiceToken.Any(char.IsWhiteSpace) || !System.Text.RegularExpressions.Regex.IsMatch(config.BridgeToken, "^[A-Za-z0-9_-]{43}$")) throw new InvalidOperationException("Invalid computer credential.");
        store.WriteSecret("mobile-bridge.dat", config with { Origin = uri.GetLeftPart(UriPartial.Authority) });
    }

    public static async Task Run(Storage store, OAuth oauth, IProvider provider, CancellationToken stopping, HttpMessageHandler? transport = null)
    {
        var config = store.ReadSecret<MobileBridgeConfig>("mobile-bridge.dat");
        if (config == null) return;
        using var http = new HttpClient(transport ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(15) };
        var paired = false;
        ModelChoice[] models = []; string? account = null; var checkedAt = DateTimeOffset.MinValue;
        void Status(bool online, bool ready, string? error = null) => store.Write("mobile-bridge-status.json", new { online, ready, error, at = DateTimeOffset.UtcNow });
        async Task<JsonElement> Post(string path, object value, CancellationToken ct)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, config.Origin + "/api/pc/" + path) { Content = JsonContent.Create(value, options: Storage.Json) };
            request.Headers.TryAddWithoutValidation("OAI-Sites-Authorization", "Bearer " + config.ServiceToken);
            request.Headers.Authorization = new("Bearer", config.BridgeToken);
            using var result = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!result.IsSuccessStatusCode) throw new InvalidOperationException("Private site connection failed (" + (int)result.StatusCode + ").");
            await using var stream = await result.Content.ReadAsStreamAsync(ct);
            using var memory = new MemoryStream(); var buffer = new byte[4096]; int n;
            while ((n = await stream.ReadAsync(buffer, ct)) > 0) { memory.Write(buffer, 0, n); if (memory.Length > 64_000) throw new InvalidOperationException("Computer response exceeded limits."); }
            using var json = JsonDocument.Parse(memory.ToArray()); return json.RootElement.Clone();
        }
        while (!stopping.IsCancellationRequested)
        {
            if (store.ReadSecret<MobileBridgeConfig>("mobile-bridge.dat") == null) { Status(false, false, "Computer connection disabled."); break; }
            try
            {
                if (!paired) { await Post("register", new { }, stopping); paired = true; }
                var current = oauth.Current;
                var ready = current?.AccessToken != null && current.Scopes.Contains("chatgpt.tokens.use.direct");
                if (ready && (account != current!.ClientId || DateTimeOffset.UtcNow - checkedAt > TimeSpan.FromMinutes(5)))
                {
                    try { models = await provider.Models(stopping); account = current.ClientId; checkedAt = DateTimeOffset.UtcNow; }
                    catch { models = []; checkedAt = DateTimeOffset.MinValue; }
                }
                ready = ready && models.Length > 0;
                var heartbeat = new { ready, models = ready ? models.Select(m => new { id = m.Slug, name = m.DisplayName }).ToArray() : [] };
                var poll = await Post("poll", heartbeat, stopping); Status(true, ready);
                if (poll.TryGetProperty("job", out var job) && job.ValueKind == JsonValueKind.Object)
                {
                    // Never replay a claimed inference after a crash or uncertain response.
                    // Only the typed request, count and offered model cross this boundary.
                    async Task Process()
                    {
                        object result;
                        try
                        {
                            var prompt = job.GetProperty("prompt").GetString()!;
                            var count = job.GetProperty("count").GetInt32();
                            var reserve = job.GetProperty("reserve").GetInt32();
                            var model = job.GetProperty("model").GetString();
                            var structured = job.TryGetProperty("structured", out var st) && st.GetBoolean();
                            var refill = job.TryGetProperty("refillCount", out var rf) ? rf.GetInt32() : 0;
                            var avoid = job.TryGetProperty("avoid", out var av) ? JsonSerializer.Deserialize<SongSuggestion[]>(av, Storage.Json) : null;
                            var brief = job.TryGetProperty("brief", out var br) ? JsonSerializer.Deserialize<MusicBrief>(br, Storage.Json) : null;
                            if (!models.Any(m => m.Slug == model) || count is < 1 or > 50 || reserve != Math.Min(25, (int)Math.Ceiling((refill > 0 ? refill : count) / 2d)) || job.GetProperty("expires").GetInt64() < DateTimeOffset.UtcNow.AddSeconds(5).ToUnixTimeMilliseconds()) throw new InvalidOperationException("Invalid or expired music request.");
                            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stopping); timeout.CancelAfter(TimeSpan.FromSeconds(refill > 0 ? 20 : 65));
                            var selected = await provider.Select(new Generation(prompt, count, [], false, Reserve: reserve, Structured: structured, Avoid: avoid, RefillCount: refill, Brief: brief), model, timeout.Token);
                            if (selected.Ids.Length != 0 || selected.Suggestions?.Length is not > 0) throw new InvalidOperationException("No song suggestions returned.");
                            result = new { id = job.GetProperty("id").GetString(), claim = job.GetProperty("claim").GetString(), ok = true, songs = selected.Suggestions, brief = selected.Brief };
                        }
                        catch (Exception) when (!stopping.IsCancellationRequested)
                        {
                            checkedAt = DateTimeOffset.MinValue;
                            result = new { id = job.GetProperty("id").GetString(), claim = job.GetProperty("claim").GetString(), ok = false };
                        }
                        await Post("complete", result, stopping);
                    }
                    var work = Process();
                    while (!work.IsCompleted)
                    {
                        await Task.WhenAny(work, Task.Delay(10_000, stopping));
                        if (!work.IsCompleted) { try { await Post("heartbeat", heartbeat, stopping); Status(true, ready); } catch { Status(false, false, "The private site is unreachable."); } }
                    }
                    await work;
                }
            }
            catch (Exception) when (!stopping.IsCancellationRequested) { Status(false, false, "The private site is unreachable or needs computer pairing."); }
            try { await Task.Delay(5000, stopping); } catch (OperationCanceledException) { break; }
        }
    }
}
