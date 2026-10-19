using System.Text.Json;

namespace QueueCompanion;

public static class SelectionRules
{
    public const string Instructions = SelectionPolicy.HelperInstructions;
    public const string CurationInstructions = SelectionPolicy.CurationInstructions;
    public static string PreferredModel(ModelChoice[] choices, string? selected, string family)
    {
        if (!string.IsNullOrWhiteSpace(selected)) {
            if (!choices.Any(m => m.Slug == selected)) throw new InvalidOperationException("Selected model is unavailable. Choose another in settings.");
            return selected;
        }
        var preferred = choices.Where(m => m.Line == family || m.Slug.Contains(family, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(m => System.Text.RegularExpressions.Regex.Replace(m.Slug, @"\d+", number => number.Value.PadLeft(12, '0')), StringComparer.Ordinal).FirstOrDefault();
        return preferred?.Slug ?? (family == SelectionPolicy.ClaudeFamily ? choices.FirstOrDefault(m => SelectionPolicy.ClaudeFallbackFamilies.Any(fallback => m.Line == fallback || m.Slug.Contains(fallback, StringComparison.OrdinalIgnoreCase)))?.Slug : null) ?? choices.FirstOrDefault()?.Slug ?? throw new InvalidOperationException("No models are available to this account.");
    }
    public static void ValidateRequest(Generation request)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt) || request.Prompt.Length > 1000 || request.Candidates.Length > 200 || request.Previous?.Length > 10 || request.Seeds?.Length > 12 || request.Seeds?.Any(x => x == null || string.IsNullOrWhiteSpace(x.Title) || string.IsNullOrWhiteSpace(x.Artist) || x.Title.Length > 200 || x.Artist.Length > 200) == true || request.Count is < 1 or > 50 || request.Reserve is < 0 or > 25 || request.Restricted && request.Reserve != 0 || request.PlaylistCount < 0 || request.PlaylistCount >= request.Count || request.PlaylistIds?.Length > 200 || request.PlaylistIds?.Distinct().Count() != request.PlaylistIds?.Length || request.PlaylistIds?.Any(id => !request.Candidates.Any(t => t.Id == id)) == true || request.PlaylistCount == 0 && request.PlaylistIds?.Length > 0 || request.PlaylistCount > 0 && (request.Seeds?.Length ?? 0) == 0) throw new InvalidOperationException("Request exceeds selection limits.");
    }
    public static string InstructionsFor(Generation request)
    {
        ValidateRequest(request);
        if (request.PlaylistCount == 0) return Instructions;
        var playlistReserves = Math.Min(2, request.Reserve);
        var discoveryCount = request.Count - request.PlaylistCount;
        var playlistLimit = request.PlaylistCount + playlistReserves;
        var discoveryLimit = discoveryCount + request.Reserve - playlistReserves;
        return Instructions + $" Exact allocation for THIS request: the final queue has {request.Count} songs total: {request.PlaylistCount} playlist originals and {discoveryCount} discoveries. Propose {playlistLimit} playlist-ID choices ({request.PlaylistCount} primary plus {playlistReserves} reserves) and {discoveryLimit} discovery choices ({discoveryCount} primary plus {request.Reserve - playlistReserves} reserves), {request.Count + request.Reserve} choices total. All candidates outside playlistIds are eligible discoveries, subject to the user's musical constraints. Put the playlist-ID choices first in ids, followed by discovery IDs; use suggestions for further discoveries if needed. Do not stop after a small handful of discoveries or after choosing all playlist candidates. Return fewer only when there are too few suitable songs. Recheck the two numeric portions before returning JSON.";
    }
    public static string Compact(Generation request) => JsonSerializer.Serialize(new { request.Prompt, request.Count, selectionLimit = request.Count + request.Reserve, candidates = request.Candidates.Select(t => new { t.Id, t.Title, t.Artist }), request.Restricted, request.Previous, request.Seeds, request.PlaylistCount, request.PlaylistIds }, Storage.Json);
    public static Selection Parse(string text, Generation request, long milliseconds)
    {
        ValidateRequest(request);
        text = text.Trim(); if (text.StartsWith("```")) { var start = text.IndexOf('\n'); if (start < 0) throw new InvalidOperationException("Model returned invalid JSON. Nothing was queued."); text = text[(start + 1)..]; if (text.EndsWith("```")) text = text[..^3].Trim(); }
        try
        {
            using var answer = JsonDocument.Parse(text);
            var ids = answer.RootElement.GetProperty("ids").EnumerateArray().Select(x => x.GetString()!).ToArray();
            var allowed = request.Candidates.Select(x => x.Id).ToHashSet();
            if (ids.Length > 200 || ids.Any(id => !allowed.Contains(id))) throw new InvalidOperationException("Model returned invalid candidate IDs. Nothing was queued.");
            // Keep valid duplicate proposals for the client to remove and replace
            // from reserves. Unknown IDs and an oversized response still fail closed.
            var suggestions = answer.RootElement.TryGetProperty("suggestions", out var s) ? JsonSerializer.Deserialize<SongSuggestion[]>(s, Storage.Json) ?? [] : [];
            if (request.Restricted && suggestions.Length > 0) throw new InvalidOperationException("Model attempted to leave the requested library. Nothing was queued.");
            if (ids.Length + suggestions.Length > 200) throw new InvalidOperationException("Model response exceeded the proposal safety limit. Nothing was queued.");
            var valid = suggestions.Where(x => x != null && !string.IsNullOrWhiteSpace(x.Title) && !string.IsNullOrWhiteSpace(x.Artist) && x.Title.Length <= 200 && x.Artist.Length <= 200).ToArray();
            var limit = request.Count + request.Reserve;
            var extra = Math.Max(0, ids.Length + valid.Length - limit);
            // Validate every ID and the source restriction before capping valid
            // proposals. Arithmetic mistakes or one malformed song need not
            // discard the rest of a completed, bounded answer.
            var boundedIds = ids.Take(limit).ToArray();
            return new(boundedIds, valid.Take(limit - boundedIds.Length).ToArray(), milliseconds, suggestions.Length - valid.Length, extra);
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException) { throw new InvalidOperationException("Model returned invalid JSON. Nothing was queued."); }
    }
}
