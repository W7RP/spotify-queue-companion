using System.Text.Json;
using QueueCompanion;

static class SelectionTests
{
    public static int Run()
    {
        var passed = 0;
        var track = new Track("c0", "spotify:track:0000000000000000000001", "Candidate", "Artist");
        var request = new Generation("Hidden gems", 1, [track], false, Reserve: 1);
        void Assert(bool value, string message) { if (!value) throw new Exception(message); }
        void Test(string name, Action body) { body(); passed++; Console.WriteLine("PASS selection " + name); }
        void Reject(Generation input, string answer = "{\"ids\":[]}")
        {
            try { SelectionRules.Parse(answer, input, 1); }
            catch (InvalidOperationException) { return; }
            throw new Exception("Invalid selection was accepted.");
        }
        Test("queue target is separate from the bounded reserve budget", () => {
            using var compact = JsonDocument.Parse(SelectionRules.Compact(request));
            Assert(compact.RootElement.GetProperty("count").GetInt32() == 1 && compact.RootElement.GetProperty("selectionLimit").GetInt32() == 2, "Wrong target or budget.");
            Assert(!compact.RootElement.ToString().Contains("spotify:track:"), "URI sent to model.");
            var selection = SelectionRules.Parse("{\"ids\":[\"c0\"],\"suggestions\":[{\"title\":\"Reserve\",\"artist\":\"Artist\"}]}", request, 1);
            Assert(selection.Ids.Length + (selection.Suggestions?.Length ?? 0) == 2, "Reserve rejected.");
        });
        Test("reserve limits and restricted source rules are enforced", () => {
            Reject(request with { Reserve = -1 }); Reject(request with { Reserve = 26 }); Reject(request with { Restricted = true });
            Reject(request with { Restricted = true, Reserve = 0 }, "{\"ids\":[],\"suggestions\":[{\"title\":\"Other\",\"artist\":\"Other\"}]}");
        });
        Test("unused extra choices cannot hide invalid IDs", () => {
            Reject(request, "{\"ids\":[\"c0\",\"fake\"]}");
            Reject(request, "{\"ids\":[\"c0\",\"c0\",\"fake\"]}");
        });
        Test("completed answers cap extra valid choices and discard malformed suggestions", () => {
            var selected = SelectionRules.Parse("{\"ids\":[\"c0\"],\"suggestions\":[{\"title\":\"\",\"artist\":\"Artist\"},{\"title\":\"A\",\"artist\":\"A\"},{\"title\":\"B\",\"artist\":\"B\"}]}", request, 1);
            Assert(selected.Ids.Length + selected.Suggestions!.Length == 2 && selected.RejectedSuggestions == 1 && selected.ExtraChoices == 1, "Proposal normalization failed.");
            Reject(request, JsonSerializer.Serialize(new { ids = Array.Empty<string>(), suggestions = Enumerable.Repeat(new SongSuggestion("Song", "Artist"), 201).ToArray() }));
        });
        Test("valid duplicate proposals survive parsing for client recovery", () => {
            var selection = SelectionRules.Parse("{\"ids\":[\"c0\",\"c0\"]}", request, 1);
            Assert(selection.Ids.Length == 2, "Client cannot recover duplicate proposals.");
        });
        Test("taste references are compact and bounded separately from queue candidates", () => {
            var seeded = request with { Seeds = [new SongSuggestion("Seed song", "Seed artist")] };
            using var compact = JsonDocument.Parse(SelectionRules.Compact(seeded));
            Assert(compact.RootElement.GetProperty("seeds")[0].GetProperty("title").GetString() == "Seed song", "Lost taste reference.");
            Assert(compact.RootElement.GetProperty("candidates").GetArrayLength() == 1, "Seed became a candidate.");
            Reject(request with { Seeds = Enumerable.Repeat(new SongSuggestion("Seed", "Artist"), 13).ToArray() });
            Reject(request with { Seeds = [new SongSuggestion("", "Artist")] });
        });
        Test("legacy generation messages retain a zero reserve budget", () => {
            var legacy = JsonSerializer.Deserialize<Generation>("{\"prompt\":\"Hidden gems\",\"count\":1,\"candidates\":[],\"restricted\":false}", Storage.Json)!;
            Assert(legacy.Reserve == 0, "Legacy request changed.");
        });
        return passed;
    }
}
