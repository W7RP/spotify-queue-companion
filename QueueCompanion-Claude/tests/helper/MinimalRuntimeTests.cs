using System.Text.Json.Nodes;
using QueueCompanion.Setup;

static class MinimalRuntimeTests
{
    const string Profile = """
    {"modules":{"stdlib":{"v":{"1.13.2":{"installed":true}},"enabled":"1.13.2"},"manager":{"v":{"1.5.1":{"installed":true}}},"store":{"v":{"1.8.1":{"installed":true}}},"spicetify-splash":{"v":{"0.1.1":{"installed":true}}}}}
    """;
    public static int Run(string root)
    {
        var passed = 0;
        void Assert(bool value, string message) { if (!value) throw new Exception(message); }
        void Test(string name, Action body) { body(); passed++; Console.WriteLine("PASS minimal runtime " + name); }
        JsonObject Parse(string json) => (JsonObject)JsonNode.Parse(json)!;
        void Delete(string path, string boundary)
        {
            Assert(Path.GetFullPath(path).StartsWith(Path.GetFullPath(boundary) + Path.DirectorySeparatorChar), "Deletion escaped runtime boundary.");
            Directory.Delete(path, true);
        }

        Test("upgrade preserves unrelated module selections and does not mutate its input", () =>
        {
            var current = Parse("""{"modules":{"my-module":{"v":{"2":{"installed":true}},"enabled":"2"},"manager":{"v":{"1.5.1":{"installed":true}},"enabled":"1.5.1"},"stdlib":{"v":{"1.12.0":{"installed":true}},"enabled":"1.12.0"}}}""");
            var before = current.ToJsonString(); var merged = MinimalRuntimeProfile.MergeSelection(current, Parse(Profile));
            Assert(current.ToJsonString() == before, "Input selection was mutated.");
            Assert(merged["modules"]!["my-module"]!.ToJsonString() == current["modules"]!["my-module"]!.ToJsonString(), "Unrelated module was changed.");
            Assert(merged["modules"]!["stdlib"]!["enabled"]!.GetValue<string>() == "1.13.2", "Pinned library was not selected.");
            Assert(merged["modules"]!["stdlib"]!["v"]!["1.12.0"] != null, "Older version record was lost.");
        });
        Test("fresh and repeated repairs keep the upstream default recovery policy disabled", () =>
        {
            var selection = MinimalRuntimeProfile.MergeSelection(new JsonObject(), Parse(Profile));
            selection = MinimalRuntimeProfile.MergeSelection(selection, Parse(Profile));
            foreach (var id in MinimalRuntimeProfile.OptionalModules)
            {
                var module = selection["modules"]![id]!;
                Assert(module["enabled"] == null, "Optional module is enabled.");
                // Upstream rc.3 local_intent checks these disabled records before looking on disk.
                Assert(((JsonObject)module["v"]!).Any(v => v.Value!["installed"]!.GetValue<bool>()), "Apply could re-seed the absent default module.");
            }
        });
        Test("upgrade cancels splash retry while preserving unrelated pending selections", () =>
        {
            var current = Parse("""{"modules":{},"pending_defaults":["spicetify-splash","my-module"]}""");
            var merged = MinimalRuntimeProfile.MergeSelection(current, Parse(Profile));
            Assert(merged["pending_defaults"]!.ToJsonString() == "[\"my-module\"]", "Pending user selection was changed or splash retry survived.");
        });
        Test("owned upgrade prunes optional packages and preserves library, extension and private state", () =>
        {
            var runtime = Path.Combine(root, "owned-runtime"); var profile = Path.Combine(root, "minimal-profile.json"); File.WriteAllText(profile, Profile);
            foreach (var id in MinimalRuntimeProfile.OptionalModules.Append("stdlib").Append("queue-companion"))
                foreach (var directory in new[] { "modules", "store" })
                {
                    var path = Path.Combine(runtime, directory, id); Directory.CreateDirectory(path); File.WriteAllText(Path.Combine(path, "marker"), id);
                }
            var state = Path.Combine(runtime, "private-state-sentinel"); File.WriteAllText(state, "preserve");
            MinimalRuntimeProfile.Apply(runtime, profile, true, Delete);
            foreach (var id in MinimalRuntimeProfile.OptionalModules)
                Assert(!Directory.Exists(Path.Combine(runtime, "modules", id)) && !Directory.Exists(Path.Combine(runtime, "store", id)), "Optional executable files survived.");
            Assert(File.ReadAllText(state) == "preserve" && Directory.Exists(Path.Combine(runtime, "modules", "stdlib")) && Directory.Exists(Path.Combine(runtime, "modules", "queue-companion")), "Unrelated state was removed.");
            var once = File.ReadAllText(Path.Combine(runtime, "modules", "vault.json")); MinimalRuntimeProfile.Apply(runtime, profile, true, Delete);
            Assert(File.ReadAllText(Path.Combine(runtime, "modules", "vault.json")) == once, "Repair was not idempotent.");
        });
        Test("pre-existing Spicetify remains unchanged and its files are never pruned", () =>
        {
            var runtime = Path.Combine(root, "user-runtime"); Directory.CreateDirectory(Path.Combine(runtime, "modules"));
            var path = Path.Combine(runtime, "modules", "vault.json"); File.WriteAllText(path, "user configuration sentinel");
            MinimalRuntimeProfile.Apply(runtime, "missing-profile", false, (_, _) => throw new Exception("Pruning user's installation."));
            Assert(File.ReadAllText(path) == "user configuration sentinel", "User-owned selection was modified.");
        });
        Test("manifest rejects re-seeded UI packages but permits unrelated user modules", () =>
        {
            var path = Path.Combine(root, "minimal-manifest.json");
            File.WriteAllText(path, """{"modules":[{"identifier":"stdlib"},{"identifier":"queue-companion"},{"identifier":"my-module"}]}""");
            MinimalRuntimeProfile.VerifyManifest(path, true);
            File.WriteAllText(path, """{"modules":[{"identifier":"stdlib"},{"identifier":"queue-companion"},{"identifier":"manager"}]}""");
            try { MinimalRuntimeProfile.VerifyManifest(path, true); throw new Exception("Optional package was accepted."); } catch (InvalidOperationException) { }
            MinimalRuntimeProfile.VerifyManifest(path, false);
        });
        return passed;
    }
}
