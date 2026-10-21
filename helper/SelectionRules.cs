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
        if (request.RefillCount < 0 || request.RefillCount > request.Count || request.RefillCount > 0 && (!request.Structured || request.Restricted || request.PlaylistCount > 0 || request.Brief == null) || request.Avoid?.Length > 75 || request.Avoid?.Any(s => s == null || string.IsNullOrWhiteSpace(s.Title) || string.IsNullOrWhiteSpace(s.Artist) || s.Title.Length > 200 || s.Artist.Length > 200 || (s.Title + s.Artist).Any(char.IsControl)) == true || request.ExcludeIds?.Length > 200 || request.ExcludeIds?.Any(id => !request.Candidates.Any(t => t.Id == id)) == true) throw new InvalidOperationException("Invalid refill limits.");
        if (request.Brief != null) ParseBrief(JsonSerializer.SerializeToElement(request.Brief, Storage.Json), request);
        if (string.IsNullOrWhiteSpace(request.Prompt) || request.Prompt.Length > 1000 || request.Candidates.Length > 200 || request.Previous?.Length > 10 || request.Seeds?.Length > 12 || request.Seeds?.Any(x => x == null || string.IsNullOrWhiteSpace(x.Title) || string.IsNullOrWhiteSpace(x.Artist) || x.Title.Length > 200 || x.Artist.Length > 200) == true || request.Count is < 1 or > 50 || request.Reserve is < 0 or > 25 || request.Restricted && request.Reserve != 0 || request.PlaylistCount < 0 || request.PlaylistCount >= request.Count || request.PlaylistIds?.Length > 200 || request.PlaylistIds?.Distinct().Count() != request.PlaylistIds?.Length || request.PlaylistIds?.Any(id => !request.Candidates.Any(t => t.Id == id)) == true || request.PlaylistCount == 0 && request.PlaylistIds?.Length > 0 || request.PlaylistCount > 0 && (request.Seeds?.Length ?? 0) == 0) throw new InvalidOperationException("Request exceeds selection limits.");
    }
    public static int ProposalLimit(Generation request) => (request.RefillCount > 0 ? request.RefillCount : request.Count) + request.Reserve;
    public static MusicBrief ParseBrief(JsonElement value, Generation request)
    {
        MusicBrief b;
        try { b = JsonSerializer.Deserialize<MusicBrief>(value, Storage.Json) ?? throw new JsonException(); }
        catch (JsonException) { throw new InvalidOperationException("The music brief could not be read. Nothing was queued."); }
        bool Names(string[]? names) => names != null && names.Length <= 6 && names.All(n => !string.IsNullOrWhiteSpace(n) && n.Length <= 120 && !n.Any(char.IsControl));
        if (b.Kind is not ("similarity" or "artist-only" or "discovery") || !Names(b.ReferenceArtists) || !Names(b.ExcludedArtists) || b.Discovery is not ("balanced" or "deep-cuts" or "new-artists" or "familiar") || b.ReferenceCount < -1 || b.ReferenceCount > request.Count || b.ExcludedVersions == null || b.ExcludedVersions.Length > 4 || b.ExcludedVersions.Any(v => v is not ("live" or "acoustic" or "remix" or "cover")) || new[] { b.Genre, b.Mood, b.Era }.Any(t => t == null || t.Length > 200 || t.Any(char.IsControl))) throw new InvalidOperationException("The music brief exceeded selection limits. Nothing was queued.");
        if (b.ReferenceType is not (null or "artist" or "collective" or "none") || b.CollectiveMembers?.Length > 12 || b.CollectiveMembers?.Any(n => string.IsNullOrWhiteSpace(n) || n.Length > 120 || n.Any(char.IsControl)) == true || b.ReferenceType != "collective" && b.CollectiveMembers?.Length > 0) throw new InvalidOperationException("The music brief exceeded collective limits. Nothing was queued.");
        return b;
    }
    public static string InstructionsFor(Generation request)
    {
        ValidateRequest(request);
        var instructions = Instructions + (request.Structured ? " " + SelectionPolicy.BriefInstructions : "");
        if (request.RefillCount > 0) return instructions + $" This is the only refill attempt. Keep the original brief unchanged. Return at most {ProposalLimit(request)} NEW choices for {request.RefillCount} unfilled slots of the original {request.Count}-song target. Do not return anything in avoid or excludeIds. No accepted songs are being regenerated.";
        if (request.PlaylistCount == 0) return instructions;
        var playlistReserves = Math.Min(2, request.Reserve);
        var discoveryCount = request.Count - request.PlaylistCount;
        var playlistLimit = request.PlaylistCount + playlistReserves;
        var discoveryLimit = discoveryCount + request.Reserve - playlistReserves;
        return instructions + $" Exact allocation for THIS request: the final queue has {request.Count} songs total: {request.PlaylistCount} playlist originals and {discoveryCount} discoveries. Propose {playlistLimit} playlist-ID choices ({request.PlaylistCount} primary plus {playlistReserves} reserves) and {discoveryLimit} discovery choices ({discoveryCount} primary plus {request.Reserve - playlistReserves} reserves), {request.Count + request.Reserve} choices total. All candidates outside playlistIds are eligible discoveries, subject to the user's musical constraints. Put the playlist-ID choices first in ids, followed by discovery IDs; use suggestions for further discoveries if needed. Do not stop after a small handful of discoveries or after choosing all playlist candidates. Return fewer only when there are too few suitable songs. Recheck the two numeric portions before returning JSON.";
    }
    public static string Compact(Generation request) => JsonSerializer.Serialize(new { request.Prompt, request.Count, selectionLimit = ProposalLimit(request), request.Structured, request.Avoid, request.RefillCount, request.Brief, request.ExcludeIds, candidates = request.Candidates.Select(t => new { t.Id, t.Title, t.Artist }), request.Restricted, request.Previous, request.Seeds, request.PlaylistCount, request.PlaylistIds }, Storage.Json);
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
            var brief = answer.RootElement.TryGetProperty("brief", out var briefValue) ? ParseBrief(briefValue, request) : request.Structured ? throw new InvalidOperationException("The model did not return a music brief. Nothing was queued.") : null;
            var limit = ProposalLimit(request);
            var extra = Math.Max(0, ids.Length + valid.Length - limit);
            // Validate every ID and the source restriction before capping valid
            // proposals. Arithmetic mistakes or one malformed song need not
            // discard the rest of a completed, bounded answer.
            var boundedIds = ids.Take(limit).ToArray();
            return new(boundedIds, valid.Take(limit - boundedIds.Length).ToArray(), milliseconds, suggestions.Length - valid.Length, extra, brief);
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException) { throw new InvalidOperationException("Model returned invalid JSON. Nothing was queued."); }
    }
}
