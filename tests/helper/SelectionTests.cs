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
        Test("playlist blends preserve separate familiar and discovery portions", () => {
            var blend = new Generation("Songs like my playlist, including one original", 3, [track], false, Reserve: 2, Seeds: [new SongSuggestion("Seed", "Artist")], PlaylistCount: 1, PlaylistIds: ["c0"]);
            using var compact = JsonDocument.Parse(SelectionRules.Compact(blend));
            Assert(compact.RootElement.GetProperty("playlistCount").GetInt32() == 1 && compact.RootElement.GetProperty("playlistIds")[0].GetString() == "c0", "Lost blend allocation.");
            Assert(!compact.RootElement.ToString().Contains("spotify:track:"), "Playlist URI sent to model.");
            var selection = SelectionRules.Parse("{\"ids\":[\"c0\"],\"suggestions\":[{\"title\":\"New\",\"artist\":\"Related\"}]}", blend, 1);
            Assert(selection.Ids.Length == 1 && selection.Suggestions!.Length == 1, "Mixed selection rejected.");
            Reject(blend with { PlaylistCount = -1 }); Reject(blend with { PlaylistCount = 3 });
            Reject(blend with { PlaylistIds = ["unknown"] }); Reject(blend with { PlaylistIds = ["c0", "c0"] });
            Reject(blend with { Seeds = [] }); Reject(blend with { PlaylistCount = 0 });
        });
        Test("legacy generation messages retain discovery without a playlist portion", () => {
            var legacy = JsonSerializer.Deserialize<Generation>("{\"prompt\":\"Hidden gems\",\"count\":1,\"candidates\":[],\"restricted\":false}", Storage.Json)!;
            Assert(legacy.PlaylistCount == 0 && legacy.PlaylistIds == null, "Legacy discovery changed.");
            SelectionRules.ValidateRequest(legacy);
        });
        Test("blend instructions calculate both primary and reserve portions explicitly", () => {
            var blend = new Generation("Similar songs including a few originals", 25, [track], false, Reserve: 13, Seeds: [new SongSuggestion("Seed", "Artist")], PlaylistCount: 3, PlaylistIds: ["c0"]);
            var instructions = SelectionRules.InstructionsFor(blend);
            Assert(instructions.Contains("3 playlist originals and 22 discoveries") && instructions.Contains("5 playlist-ID choices") && instructions.Contains("33 discovery choices") && instructions.Contains("38 choices total"), "Incorrect blend arithmetic.");
            Assert(SelectionRules.InstructionsFor(blend with { Restricted = true, Reserve = 0 }).Contains("22 discovery choices"), "Restricted blend gained reserves.");
            Assert(SelectionRules.InstructionsFor(request) == SelectionRules.Instructions, "Ordinary discovery instructions changed.");
        });
        return passed;
    }
}
