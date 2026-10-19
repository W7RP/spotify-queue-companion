using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;

namespace QueueCompanion;

public record ClaudeCredential(string ApiKey);
public record ClaudeUsage(string Model, int InputTokens, int OutputTokens);

public sealed class ClaudeProvider(Storage store, HttpClient http) : IProvider
{
    readonly SemaphoreSlim connectionGate = new(1, 1);
    readonly object stateGate = new();
    string? modelKey;
    ModelChoice[]? models;
    ClaudeUsage? usage;
    long epoch;
    string Key() => store.ReadSecret<ClaudeCredential>("claude-key.dat")?.ApiKey ?? throw new InvalidOperationException("Connect a Claude API key in Queue Companion settings.");
    (string Key, long Version) Snapshot() { lock (stateGate) return (Key(), epoch); }
    public object Status() { lock (stateGate) return new { connected = File.Exists(Path.Combine(store.Root, "claude-key.dat")), lastUsage = usage, billing = "Uses Anthropic API credits. Exact remaining balance is unavailable here. Claude Pro subscription login is not included." }; }
    public async Task<object> Connect(string key, CancellationToken ct)
    {
        key = key.Trim();
        if (!key.StartsWith("sk-ant-", StringComparison.Ordinal) || key.StartsWith("sk-ant-oat", StringComparison.Ordinal) || key.StartsWith("sk-ant-ort", StringComparison.Ordinal) || key.Length is < 20 or > 512 || key.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-' && c != '_')) throw new InvalidOperationException("Enter an Anthropic API key from Claude Console. Subscription login tokens are not API keys.");
        await connectionGate.WaitAsync(ct);
        try
        {
            var version = Interlocked.Read(ref epoch);
            var choices = await FetchModels(key, ct); ct.ThrowIfCancellationRequested();
            lock (stateGate)
            {
                if (version != epoch) throw new InvalidOperationException("Claude connection changed. Try again.");
                store.WriteSecret("claude-key.dat", new ClaudeCredential(key));
                epoch++; models = choices; modelKey = key; usage = null;
            }
            return new { connected = true, modelCount = choices.Length };
        }
        finally { connectionGate.Release(); }
    }
    public object Disconnect()
    {
        lock (stateGate) { epoch++; store.Delete("claude-key.dat"); models = null; modelKey = null; usage = null; }
        return new { disconnected = true, note = "API key removed from this computer. Revoke it in Claude Console if needed." };
    }
    public async Task<ModelChoice[]> Models(CancellationToken ct)
    {
        var (key, version) = Snapshot(); var choices = await FetchModels(key, ct);
        lock (stateGate) { if (version != epoch) throw new InvalidOperationException("Claude connection changed. Try again."); models = choices; modelKey = key; }
        return choices;
    }
    async Task<ModelChoice[]> FetchModels(string key, CancellationToken ct)
    {
        var choices = new List<ModelChoice>(); string? after = null;
        for (var page = 0; page < 3; page++)
        {
            using var req = Request(HttpMethod.Get, "models?limit=100" + (after == null ? "" : "&after_id=" + Uri.EscapeDataString(after)), key);
            using var response = await http.SendAsync(req, ct); await Check(response, ct);
            var body = await response.Content.ReadAsStringAsync(ct); if (body.Length > 1_000_000) throw new InvalidOperationException("Claude model catalogue exceeded the limit.");
            using var json = JsonDocument.Parse(body); var root = json.RootElement;
            foreach (var model in root.GetProperty("data").EnumerateArray())
            {
                if (model.TryGetProperty("lifecycle", out var life) && life.GetString() is "retired") continue;
                var id = model.GetProperty("id").GetString()!; var name = model.GetProperty("display_name").GetString()!;
                var family = model.TryGetProperty("line", out var modelLine) && modelLine.ValueKind == JsonValueKind.String ? modelLine.GetString() : null;
                if (id.Length is > 0 and <= 100 && name.Length <= 200) choices.Add(new(id, name, family));
            }
            if (!root.TryGetProperty("has_more", out var more) || !more.GetBoolean()) break;
            after = root.GetProperty("last_id").GetString(); if (string.IsNullOrWhiteSpace(after) || after.Length > 100) throw new InvalidOperationException("Claude model catalogue pagination failed.");
        }
        var result = choices.DistinctBy(m => m.Slug).ToArray();
        if (result.Length == 0) throw new InvalidOperationException("No Claude models are available to this API key.");
        return result;
    }
    public async Task<Selection> Select(Generation request, string? selected, CancellationToken ct)
    {
        SelectionRules.ValidateRequest(request); var (key, version) = Snapshot();
        ModelChoice[]? choices; lock (stateGate) choices = modelKey == key ? models : null;
        if (choices == null)
        {
            choices = await FetchModels(key, ct);
            lock (stateGate) { if (version != epoch) throw new InvalidOperationException("Claude connection changed. Try again."); models = choices; modelKey = key; }
        }
        lock (stateGate) { if (version != epoch) throw new InvalidOperationException("Claude connection changed. Try again."); }
        var model = SelectionRules.PreferredModel(choices, selected, SelectionPolicy.ClaudeFamily);
        if (!choices.Any(m => m.Slug == model)) throw new InvalidOperationException("Selected Claude model is unavailable. Choose another in settings.");
        var body = new Dictionary<string, object> { ["model"] = model, ["system"] = SelectionRules.InstructionsFor(request), ["messages"] = new[] { new { role = "user", content = SelectionRules.Compact(request) } }, ["max_tokens"] = Math.Clamp(512 + (request.Count + request.Reserve) * 90, 512, 6000), ["stream"] = true };
        if (SelectionPolicy.ClaudeLowEffortModels.Contains(model)) body["output_config"] = new { effort = SelectionPolicy.Effort };
        if (request.Structured && SelectionPolicy.ClaudeLowEffortModels.Contains(model)) {
            using var schema = JsonDocument.Parse(SelectionPolicy.ResponseSchemaJson);
            body["output_config"] = new { effort = SelectionPolicy.Effort, format = new { type = "json_schema", schema = schema.RootElement.Clone() } };
        }
        using var req = Request(HttpMethod.Post, "messages", key);
        req.Content = new StringContent(JsonSerializer.Serialize(body, Storage.Json), Encoding.UTF8, "application/json");
        var clock = Stopwatch.StartNew(); using var response = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct); await Check(response, ct);
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(ct));
        var text = new StringBuilder(); var data = new StringBuilder(); var completed = false; var started = false; string? stop = null; var length = 0; var inputTokens = 0; var outputTokens = 0;
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            length += line.Length; if (length > 2_000_000) throw new InvalidOperationException("Claude stream exceeded the selection limit.");
            if (line.StartsWith("data:")) { if (data.Length > 0) data.Append('\n'); data.Append(line[5..].TrimStart()); continue; }
            if (line.Length != 0 || data.Length == 0) continue;
            using var evt = JsonDocument.Parse(data.ToString()); data.Clear(); var root = evt.RootElement; var type = root.GetProperty("type").GetString();
            if (type == "error") throw new InvalidOperationException("Claude could not complete selection. Check API credits or retry later. Nothing was queued.");
            if (type == "message_start") { started = true; if (root.GetProperty("message").TryGetProperty("usage", out var u)) { if (u.TryGetProperty("input_tokens", out var i)) inputTokens = i.GetInt32(); } }
            if (type == "content_block_start" && root.GetProperty("content_block").GetProperty("type").GetString() is "tool_use" or "server_tool_use") throw new InvalidOperationException("Claude returned an unexpected tool request. Nothing was queued.");
            if (type == "content_block_delta" && root.GetProperty("delta").GetProperty("type").GetString() == "text_delta") text.Append(root.GetProperty("delta").GetProperty("text").GetString());
            if (text.Length > 32_000) throw new InvalidOperationException("Claude answer exceeded the selection limit.");
            if (type == "message_delta") { if (root.GetProperty("delta").TryGetProperty("stop_reason", out var reason) && reason.ValueKind == JsonValueKind.String) stop = reason.GetString(); if (root.TryGetProperty("usage", out var u) && u.TryGetProperty("output_tokens", out var o)) outputTokens = o.GetInt32(); }
            if (type == "message_stop") { completed = true; break; }
        }
        if (!started || !completed) throw new InvalidOperationException("Claude stream ended before completion. Nothing was queued.");
        if (stop != "end_turn") throw new InvalidOperationException(stop == "max_tokens" ? "Claude reached the response limit. Try fewer songs. Nothing was queued." : "Claude did not finish a selection. Nothing was queued.");
        var selection = SelectionRules.Parse(text.ToString(), request, clock.ElapsedMilliseconds);
        lock (stateGate) { if (version != epoch) throw new InvalidOperationException("Claude connection changed during selection. Nothing was queued."); usage = new(model, inputTokens, outputTokens); }
        return selection;
    }
    static HttpRequestMessage Request(HttpMethod method, string path, string key)
    {
        var request = new HttpRequestMessage(method, "https://api.anthropic.com/v1/" + path);
        request.Headers.Add("x-api-key", key); request.Headers.Add("anthropic-version", "2023-06-01"); request.Headers.UserAgent.ParseAdd("QueueCompanion/0.2.6"); return request;
    }
    static async Task Check(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var credit = false;
        if (response.StatusCode == HttpStatusCode.BadRequest)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            // Inspect only for a useful billing distinction; never relay provider text or credentials.
            if (body.Length <= 16_000) credit = body.Contains("credit balance", StringComparison.OrdinalIgnoreCase);
        }
        throw new InvalidOperationException(response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => "Claude API key was rejected. Reconnect in settings.",
            HttpStatusCode.Forbidden => "This Claude API key lacks access to the selected workspace or model.",
            HttpStatusCode.TooManyRequests => "Claude API rate or spending limit reached. Try again later.",
            HttpStatusCode.BadRequest when credit => "Claude API credit balance is too low. Add credits in Claude Console.",
            _ when (int)response.StatusCode == 529 => "Claude API is overloaded. Try again later.",
            _ => $"Claude API request failed ({(int)response.StatusCode}). Nothing was queued."
        });
    }
}
