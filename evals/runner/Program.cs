using QueueCompanion;
using System.Text.Json;
string Arg(string name) => args.SkipWhile(x => x != name).Skip(1).FirstOrDefault() ?? throw new ArgumentException(name + " is required.");
var dataset = JsonDocument.Parse(File.ReadAllText(Arg("--cases")));
var output = Path.GetFullPath(Arg("--output"));
var stage = Arg("--stage");
var store = new Storage();
using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(70) };
var oauth = new OAuth(store, http);
var rows = new List<object>();
var cases = dataset.RootElement.EnumerateArray().ToArray();
var runs = cases.Concat(new[] { cases[0], cases[1], cases[12] }).ToArray();
foreach (var (name, provider) in new (string, IProvider)[] { ("chatgpt", new ChatGptProvider(oauth, http)), ("claude", new ClaudeProvider(store, http)) }) {
 if (name == "chatgpt" && oauth.Current?.AccessToken == null || name == "claude" && !File.Exists(Path.Combine(store.Root, "claude-key.dat"))) { Console.WriteLine(name + ": not connected; skipped"); continue; }
 var model = SelectionRules.PreferredModel(await provider.Models(default), null, name == "chatgpt" ? "luna" : "haiku");
 foreach (var item in runs) {
  var prompt = item.GetProperty("prompt").GetString()!; var count = item.GetProperty("count").GetInt32();
  try {
   using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(65));
   var answer = await provider.Select(new Generation(prompt, count, [], false, Reserve: Math.Min(25, (int)Math.Ceiling(count / 2d)), Structured: stage != "baseline"), model, timeout.Token);
   var serialized = JsonSerializer.SerializeToElement(answer, Storage.Json);
   var row = new { stage, provider = name, model, prompt, count, generationMs = answer.GenerationMs, songs = answer.Suggestions, brief = serialized.TryGetProperty("brief", out var b) ? (object?)b : null, error = (string?)null };
   rows.Add(row); Console.WriteLine(name + " " + rows.Count + "/" + runs.Length + ": " + answer.GenerationMs + " ms");
  } catch { rows.Add(new { stage, provider = name, model, prompt, count, error = "selection_failed" }); Console.WriteLine(name + " " + rows.Count + "/" + runs.Length + ": failed (sanitized)"); }
  Directory.CreateDirectory(Path.GetDirectoryName(output)!);
  File.WriteAllText(output, JsonSerializer.Serialize(rows, new JsonSerializerOptions(Storage.Json) { WriteIndented = true }));
 }
}
