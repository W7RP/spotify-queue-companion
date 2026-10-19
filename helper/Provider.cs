using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace QueueCompanion;

public interface IProvider
{
    Task<ModelChoice[]> Models(CancellationToken ct);
    Task<Selection> Select(Generation request, string? model, CancellationToken ct);
}

public sealed class ChatGptProvider(OAuth auth, HttpClient http) : IProvider
{
    ModelChoice[]? models;
    string? modelAccount;
    public async Task<ModelChoice[]> Models(CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "https://api.openai.com/v1/models");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await auth.Access(ct));
        using var response = await http.SendAsync(req, ct); await Check(response, ct);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        models = json.RootElement.GetProperty("models").EnumerateArray().Where(x => x.TryGetProperty("visibility", out var v) && v.GetString() == "list").Select(x => new ModelChoice(x.GetProperty("slug").GetString()!, x.GetProperty("display_name").GetString()!)).ToArray();
        modelAccount = auth.Current?.ClientId;
        return models;
    }
    public async Task<Selection> Select(Generation request, string? selected, CancellationToken ct)
    {
        SelectionRules.ValidateRequest(request);
        if (models == null || modelAccount != auth.Current?.ClientId) await Models(ct);
        var model = SelectionRules.PreferredModel(models!, selected, SelectionPolicy.ChatGptFamily);
        if (!models!.Any(x => x.Slug == model)) throw new InvalidOperationException("Selected model is unavailable. Choose another in settings.");
        var instructions = SelectionRules.InstructionsFor(request);
        var compact = SelectionRules.Compact(request);
        var body = new Dictionary<string, object> { ["model"] = model, ["instructions"] = instructions, ["input"] = new[] { new { role = "user", content = compact } }, ["store"] = false, ["stream"] = true };
        // Music selection needs modest reasoning. Only apply the documented
        // option to known GPT-6 families; other manually selected models keep
        // their existing API contract without an unsupported parameter.
        var lowEffortModels = SelectionPolicy.ChatGptLowEffortFamilies;
        if (lowEffortModels.Any(name => model == name || model.StartsWith(name + "-", StringComparison.Ordinal))) body["reasoning"] = new { effort = SelectionPolicy.Effort };
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await auth.Access(ct));
        req.Content = new StringContent(JsonSerializer.Serialize(body, Storage.Json), Encoding.UTF8, "application/json");
        var clock = Stopwatch.StartNew();
        using var response = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct); await Check(response, ct);
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(ct));
        var output = new StringBuilder(); var data = new StringBuilder(); var completed = false; var bytes = 0;
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            bytes += line.Length; if (bytes > 2_000_000) throw new InvalidOperationException("Inference stream exceeded the safety limit.");
            if (line.StartsWith("data:")) { if (data.Length > 0) data.Append('\n'); data.Append(line[5..].TrimStart()); continue; }
            if (line.Length != 0 || data.Length == 0) continue;
            var value = data.ToString(); data.Clear(); if (value == "[DONE]") break;
            using var evt = JsonDocument.Parse(value); var root = evt.RootElement;
            var type = root.GetProperty("type").GetString();
            if (type == "response.output_text.delta") output.Append(root.GetProperty("delta").GetString());
            if (output.Length > 32_000) throw new InvalidOperationException("Model answer exceeded the selection limit.");
            if (type is "response.failed" or "response.incomplete" or "error")
            {
                var error = root.TryGetProperty("error", out var direct) ? direct : root.TryGetProperty("response", out var r) && r.TryGetProperty("error", out var nested) ? nested : default;
                var code = error.ValueKind == JsonValueKind.Object && error.TryGetProperty("code", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : type;
                if (code?.Length > 80 || code?.Any(ch => !char.IsLetterOrDigit(ch) && ch != '_' && ch != '-') == true) code = type;
                throw new InvalidOperationException($"ChatGPT could not complete selection ({code}). Check your plan or retry.");
            }
            if (type == "response.completed") { completed = true; break; }
        }
        if (!completed) throw new InvalidOperationException("ChatGPT stream ended before completion. Nothing was queued.");
        return SelectionRules.Parse(output.ToString(), request, clock.ElapsedMilliseconds);
    }
    static async Task Check(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        // Do not log response bodies, headers, tokens or identity data.
        await Task.CompletedTask;
        throw new InvalidOperationException(response.StatusCode switch { System.Net.HttpStatusCode.Unauthorized => "ChatGPT connection was revoked or expired. Reconnect in settings.", System.Net.HttpStatusCode.Forbidden => "ChatGPT plan usage is unavailable for this account or workspace.", System.Net.HttpStatusCode.TooManyRequests => "ChatGPT usage limit reached. Try again later.", _ => $"ChatGPT request failed ({(int)response.StatusCode}). Nothing was queued." });
    }
}
