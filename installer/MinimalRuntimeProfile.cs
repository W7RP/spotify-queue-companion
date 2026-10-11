using System.Text.Json;
using System.Text.Json.Nodes;

namespace QueueCompanion.Setup;

internal static class MinimalRuntimeProfile
{
    internal static readonly string[] OptionalModules = ["manager", "store", "spicetify-splash"];
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    internal static JsonObject MergeSelection(JsonObject current, JsonObject bundled)
    {
        var result = (JsonObject)current.DeepClone();
        var modules = result["modules"] as JsonObject;
        if (modules == null) { modules = new JsonObject(); result["modules"] = modules; }
        var selections = bundled["modules"] as JsonObject ?? throw new InvalidOperationException("Bundled integration selection is missing.");
        foreach (var id in OptionalModules.Append("stdlib"))
        {
            var selected = selections[id] as JsonObject ?? throw new InvalidOperationException("Bundled integration selection is incomplete.");
            var previous = modules[id] as JsonObject;
            var merged = previous == null ? new JsonObject() : (JsonObject)previous.DeepClone();
            var versions = merged["v"] as JsonObject;
            if (versions == null) { versions = new JsonObject(); merged["v"] = versions; }
            foreach (var version in (JsonObject)selected["v"]!) versions[version.Key] = version.Value!.DeepClone();
            if (id == "stdlib") merged["enabled"] = selected["enabled"]!.DeepClone();
            else merged.Remove("enabled");
            modules[id] = merged;
        }
        // Cancel any first-run splash retry left by an older Apply.
        if (result["pending_defaults"] is JsonArray pending)
            for (var i = pending.Count - 1; i >= 0; i--)
                if (OptionalModules.Contains(pending[i]?.GetValue<string>())) pending.RemoveAt(i);
        return result;
    }

    internal static void Apply(string runtimeRoot, string bundledSelection, bool owned, Action<string, string> removeTree)
    {
        if (!owned) return; // Never change a user's pre-existing Spicetify setup.
        var path = Path.Combine(runtimeRoot, "modules", "vault.json");
        var current = File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path)) as JsonObject : new JsonObject();
        var bundled = JsonNode.Parse(File.ReadAllText(bundledSelection)) as JsonObject;
        if (current == null || bundled == null) throw new InvalidOperationException("Integration selection could not be read. Repair after restoring its saved configuration.");
        var merged = MergeSelection(current, bundled);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path + ".tmp", merged.ToJsonString(Json)); File.Move(path + ".tmp", path, true);
        PruneOptionalFiles(runtimeRoot, removeTree);
    }

    internal static void PruneOptionalFiles(string runtimeRoot, Action<string, string> removeTree)
    {
        foreach (var id in OptionalModules)
            foreach (var directory in new[] { "modules", "store" })
            {
                var path = Path.Combine(runtimeRoot, directory, id);
                if (Directory.Exists(path)) removeTree(path, runtimeRoot);
            }
    }

    internal static void VerifyManifest(string manifestPath, bool owned)
    {
        if (!owned) return;
        using var manifest = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var identifiers = manifest.RootElement.GetProperty("modules").EnumerateArray().Select(m => m.GetProperty("identifier").GetString()).ToArray();
        if (!identifiers.Contains("stdlib") || !identifiers.Contains("queue-companion") || identifiers.Any(id => OptionalModules.Contains(id)))
            throw new InvalidOperationException("The minimal integration did not stage correctly. Use Repair; the stock Spotify backup is retained.");
    }
}
