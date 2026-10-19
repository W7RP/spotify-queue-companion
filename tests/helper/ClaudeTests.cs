using System.Net;
using System.Text;
using System.Text.Json;
using QueueCompanion;

static class ClaudeTests
{
    const string Key = "sk-ant-FAKE_TEST_KEY_ONLY_123456";
    const string OtherKey = "sk-ant-FAKE_REPLACEMENT_ONLY_654321";
    static HttpResponseMessage Response(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    const string Catalogue = "{\"data\":[{\"id\":\"general-model-test\",\"display_name\":\"Sonnet test\",\"line\":\"sonnet\"},{\"id\":\"fast-model-test\",\"display_name\":\"Haiku test\",\"line\":\"haiku\"}],\"has_more\":false}";
    static string Event(object value) => "event: ignored\ndata: " + JsonSerializer.Serialize(value) + "\n\n";
    static string Stream(string text, string reason = "end_turn", bool complete = true) =>
        Event(new { type = "message_start", message = new { usage = new { input_tokens = 321 } } }) +
        Event(new { type = "content_block_start", content_block = new { type = "text", text = "" } }) +
        Event(new { type = "content_block_delta", delta = new { type = "text_delta", text } }) +
        Event(new { type = "message_delta", delta = new { stop_reason = reason }, usage = new { output_tokens = 42 } }) +
        (complete ? Event(new { type = "message_stop" }) : "");
    public static async Task<int> Run(string root)
    {
        var store = new Storage(root); var passed = 0;
        var track = new Track("0000000000000000000001", "spotify:track:0000000000000000000001", "Candidate", "Artist");
        var generation = new Generation("Only liked mellow songs", 1, [track], true);
        var answer = JsonSerializer.Serialize(new { ids = new[] { track.Id }, suggestions = Array.Empty<SongSuggestion>() });
        void Assert(bool value, string message) { if (!value) throw new Exception(message); }
        async Task Test(string name, Func<Task> body) { await body(); passed++; Console.WriteLine("PASS Claude " + name); }
        async Task Reject(Func<Task> body, string expected) { try { await body(); } catch (InvalidOperationException e) { Assert(e.Message.Contains(expected) && !e.Message.Contains(Key), "Wrong or unsafe error: " + e.Message); return; } throw new Exception("Operation unexpectedly succeeded."); }
        void Credentials() => store.WriteSecret("claude-key.dat", new ClaudeCredential(Key));
        await Test("structured Haiku combines low effort with its schema and returns a brief",async()=>{
            Credentials();var posts=0;var brief=new MusicBrief("discovery",[],[],"rock","","","balanced",-1,[]);
            using var client=new HttpClient(new FakeHandler(async request=>{
                if(request.Method==HttpMethod.Get)return Response("{\"data\":[{\"id\":\"claude-haiku-5-5\",\"display_name\":\"Haiku\"}],\"has_more\":false}");
                posts++;using var body=JsonDocument.Parse(await request.Content!.ReadAsStringAsync());var output=body.RootElement.GetProperty("output_config");
                Assert(output.GetProperty("effort").GetString()=="low"&&output.GetProperty("format").GetProperty("type").GetString()=="json_schema","Schema and effort did not coexist.");
                return Response(Stream(JsonSerializer.Serialize(new{ids=Array.Empty<string>(),suggestions=new[]{new SongSuggestion("Song","Artist")},brief},Storage.Json)));
            }));
            var selected=await new ClaudeProvider(store,client).Select(new Generation("mellow rock",1,[],false,Structured:true),null,default);
            Assert(posts==1&&selected.Brief?.Genre=="rock","Brief lost or extra inference made.");
        });
        await Test("API contract, one bounded inference, available-model preference and usage", async () => {
            var gets = 0; var posts = 0;
            using var client = new HttpClient(new FakeHandler(async request => {
                Assert(request.RequestUri!.Host == "api.anthropic.com" && request.RequestUri.Scheme == "https", "Wrong endpoint.");
                Assert(request.Headers.GetValues("x-api-key").Single() == Key && request.Headers.GetValues("anthropic-version").Single() == "2023-06-01", "Wrong authentication contract.");
                Assert(request.Headers.Authorization == null, "Borrowed OAuth authorization.");
                if (request.Method == HttpMethod.Get) { gets++; return Response(Catalogue); }
                posts++; Assert(request.RequestUri.AbsolutePath == "/v1/messages", "Wrong Messages endpoint.");
                using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()); var b = body.RootElement;
                Assert(b.GetProperty("model").GetString() == "fast-model-test" && b.GetProperty("stream").GetBoolean(), "Model family was not taken from the catalogue or streaming is disabled.");
                Assert(b.GetProperty("max_tokens").GetInt32() is > 0 and <= 6000 && b.GetProperty("messages").GetArrayLength() == 1, "Unbounded request.");
                Assert(!b.TryGetProperty("tools", out _) && !b.TryGetProperty("store", out _) && !b.TryGetProperty("max_output_tokens", out _), "Wrong API fields.");
                var compact = b.GetProperty("messages")[0].GetProperty("content").GetString()!;
                Assert(!compact.Contains("spotify:track:") && !compact.Contains(Key), "Unnecessary URI or key in inference.");
                using var payload = JsonDocument.Parse(compact); Assert(payload.RootElement.GetProperty("restricted").GetBoolean(), "Lost source restriction.");
                return Response(Stream(answer));
            }));
            var provider = new ClaudeProvider(store, client); await provider.Connect(Key, default);
            var selected = await provider.Select(generation, null, default);
            Assert(selected.Ids.SequenceEqual(new[] { track.Id }) && gets == 1 && posts == 1, "Selection or call count wrong.");
            var status = JsonSerializer.SerializeToElement(provider.Status(), Storage.Json);
            Assert(status.GetProperty("lastUsage").GetProperty("inputTokens").GetInt32() == 321 && status.GetProperty("lastUsage").GetProperty("outputTokens").GetInt32() == 42, "Usage not recorded.");
            Assert(!status.ToString().Contains(Key) && !Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(root, "claude-key.dat"))).Contains(Key), "Key exposed in status or disk.");
        });
        await Test("discovery reserves retain one Messages call and a bounded token budget", async () => {
            Credentials(); var posts = 0;
            using var client = new HttpClient(new FakeHandler(async request => {
                if (request.Method == HttpMethod.Get) return Response(Catalogue);
                posts++; using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
                Assert(body.RootElement.GetProperty("max_tokens").GetInt32() == 782, "Reserves missing from token budget.");
                using var compact = JsonDocument.Parse(body.RootElement.GetProperty("messages")[0].GetProperty("content").GetString()!);
                Assert(compact.RootElement.GetProperty("count").GetInt32() == 2 && compact.RootElement.GetProperty("selectionLimit").GetInt32() == 3, "Queue target changed.");
                return Response(Stream(JsonSerializer.Serialize(new { ids = new[] { track.Id }, suggestions = new[] { new SongSuggestion("Song A", "Artist"), new SongSuggestion("Song B", "Artist") } })));
            }));
            var selected = await new ClaudeProvider(store, client).Select(generation with { Count = 2, Restricted = false, Reserve = 1 }, null, default);
            Assert(posts == 1 && selected.Ids.Length + (selected.Suggestions?.Length ?? 0) == 3, "Wrong call count or reserve selection.");
        });
        await Test("catalogue pagination, retired exclusion and unavailable-model rejection", async () => {
            Credentials(); var gets = 0; var posts = 0;
            using var client = new HttpClient(new FakeHandler(request => {
                if (request.Method == HttpMethod.Post) { posts++; return Task.FromResult(Response(Stream(answer))); }
                gets++; return Task.FromResult(Response(request.RequestUri!.Query.Contains("after_id=page-one") ? Catalogue : "{\"data\":[{\"id\":\"old-model\",\"display_name\":\"Retired\",\"lifecycle\":\"retired\"}],\"has_more\":true,\"last_id\":\"page-one\"}"));
            }));
            var provider = new ClaudeProvider(store, client); var models = await provider.Models(default);
            Assert(gets == 2 && models.Length == 2 && !models.Any(m => m.Slug == "old-model"), "Pagination or retirement failed.");
            await Reject(() => provider.Select(generation, "invented-model", default), "unavailable"); Assert(posts == 0, "Invalid model was sent.");
        });
        await Test("truncated, limited, refusal, error and tool streams cannot commit", async () => {
            foreach (var (stream, expected) in new[] {
                (Stream(answer, complete:false), "ended before completion"), (Stream(answer, "max_tokens"), "response limit"),
                (Stream(answer, "refusal"), "did not finish"), (Event(new {type="error", error=new {message=Key}}), "could not complete"),
                (Event(new {type="content_block_start", content_block=new {type="tool_use"}}), "unexpected tool") })
            {
                Credentials(); var posts = 0;
                using var client = new HttpClient(new FakeHandler(request => { if(request.Method == HttpMethod.Post) posts++; return Task.FromResult(Response(request.Method == HttpMethod.Get ? Catalogue : stream)); }));
                var provider = new ClaudeProvider(store, client); await Reject(() => provider.Select(generation, null, default), expected);
                Assert(posts == 1 && JsonSerializer.SerializeToElement(provider.Status(), Storage.Json).GetProperty("lastUsage").ValueKind == JsonValueKind.Null, "Retry or misleading usage.");
            }
        });
        await Test("shared source and JSON validation rejects unsafe selections", async () => {
            foreach (var (text, expected) in new[] { ("{\"ids\":[\"unknown\"]}", "invalid candidate"),
                ("{\"ids\":[],\"suggestions\":[{\"title\":\"Outside\",\"artist\":\"Artist\"}]}", "requested library"),
                ("not JSON", "invalid JSON") })
            {
                Credentials(); using var client = new HttpClient(new FakeHandler(request => Task.FromResult(Response(request.Method == HttpMethod.Get ? Catalogue : Stream(text)))));
                await Reject(() => new ClaudeProvider(store,client).Select(generation with {Count=2}, null, default), expected);
            }
        });
        await Test("HTTP failures are explicit, sanitized and never retried", async () => {
            foreach(var (code, expected) in new[] {(401,"rejected"),(403,"lacks access"),(429,"spending limit"),(529,"overloaded"),(400,"credit balance")}) {
                Credentials(); var posts=0; using var client=new HttpClient(new FakeHandler(request=>{if(request.Method==HttpMethod.Get)return Task.FromResult(Response(Catalogue));posts++;return Task.FromResult(Response("{\"error\":\"credit balance too low "+Key+"\"}",(HttpStatusCode)code));}));
                await Reject(()=>new ClaudeProvider(store,client).Select(generation,null,default),expected);Assert(posts==1,"Failure retried.");
            }
        });
        await Test("failed replacement and invalid token preserve existing protected key", async () => {
            Credentials(); var calls=0; using var client=new HttpClient(new FakeHandler(_=>{calls++;return Task.FromResult(Response("{}",HttpStatusCode.Unauthorized));}));var provider=new ClaudeProvider(store,client);
            await Reject(()=>provider.Connect("subscription-token",default),"API key");await Reject(()=>provider.Connect("sk-ant-oat01-FAKE_SUBSCRIPTION_TOKEN",default),"API key");Assert(calls==0,"Invalid token reached network.");
            await Reject(()=>provider.Connect(OtherKey,default),"rejected");Assert(store.ReadSecret<ClaudeCredential>("claude-key.dat")!.ApiKey==Key,"Old key lost on failed replacement.");
        });
        await Test("successful key rotation resets model cache and usage", async () => {
            Credentials(); using var client=new HttpClient(new FakeHandler(request=>Task.FromResult(Response(request.Method==HttpMethod.Get?Catalogue:Stream(answer)))));var provider=new ClaudeProvider(store,client);
            await provider.Select(generation,null,default);await provider.Connect(OtherKey,default);
            Assert(store.ReadSecret<ClaudeCredential>("claude-key.dat")!.ApiKey==OtherKey,"Key not replaced.");
            Assert(JsonSerializer.SerializeToElement(provider.Status(),Storage.Json).GetProperty("lastUsage").ValueKind==JsonValueKind.Null,"Old usage retained.");
        });
        await Test("disconnect during connection cannot resurrect a key", async () => {
            Credentials();var entered=new TaskCompletionSource();var release=new TaskCompletionSource();using var client=new HttpClient(new FakeHandler(async _=>{entered.SetResult();await release.Task;return Response(Catalogue);}));var provider=new ClaudeProvider(store,client);
            var pending=provider.Connect(OtherKey,default);await entered.Task;provider.Disconnect();release.SetResult();await Reject(()=>pending,"connection changed");Assert(!File.Exists(Path.Combine(root,"claude-key.dat")),"Connection resurrected.");
        });
        await Test("disconnect during model retrieval prevents an inference call", async () => {
            Credentials();var entered=new TaskCompletionSource();var release=new TaskCompletionSource();var posts=0;
            using var client=new HttpClient(new FakeHandler(async request=>{if(request.Method==HttpMethod.Post){posts++;return Response(Stream(answer));}entered.SetResult();await release.Task;return Response(Catalogue);}));var provider=new ClaudeProvider(store,client);
            var pending=provider.Select(generation,null,default);await entered.Task;provider.Disconnect();release.SetResult();await Reject(()=>pending,"connection changed");Assert(posts==0,"Inference sent after disconnect.");
        });
        await Test("disconnect during inference discards completed selection", async () => {
            Credentials();var entered=new TaskCompletionSource();var release=new TaskCompletionSource();using var client=new HttpClient(new FakeHandler(async request=>{if(request.Method==HttpMethod.Get)return Response(Catalogue);entered.SetResult();await release.Task;return Response(Stream(answer));}));var provider=new ClaudeProvider(store,client);
            var pending=provider.Select(generation,null,default);await entered.Task;provider.Disconnect();release.SetResult();await Reject(()=>pending,"connection changed during selection");
        });
        await Test("cancellation during key verification cannot persist a key", async () => {
            Credentials();using var cts=new CancellationTokenSource();using var client=new HttpClient(new FakeHandler(_=>{cts.Cancel();return Task.FromResult(Response(Catalogue));}));var provider=new ClaudeProvider(store,client);
            try{await provider.Connect(OtherKey,cts.Token);throw new Exception("Cancelled connect succeeded.");}catch(OperationCanceledException){}
            Assert(store.ReadSecret<ClaudeCredential>("claude-key.dat")!.ApiKey==Key,"Cancelled connection replaced key.");
        });
        await Test("removed key cannot reach the service and preferences keep provider-specific models", async () => {
            using var client=new HttpClient(new FakeHandler(_=>throw new Exception("Network must not be reached.")));var provider=new ClaudeProvider(store,client);provider.Disconnect();await Reject(()=>provider.Select(generation,null,default),"Connect a Claude API key");
            var legacy=JsonSerializer.Deserialize<Settings>("{\"length\":15,\"cap\":50,\"mode\":\"append\",\"model\":\"gpt-test\",\"history\":true}",Storage.Json)!;
            Assert(legacy.Provider=="claude"&&legacy.Model=="gpt-test","Variant defaults or legacy model lost.");
            store.Write("settings.json",legacy with{Provider="chatgpt",ClaudeModel="claude-test"});var saved=store.Read<Settings>("settings.json")!;Assert(saved.Provider=="chatgpt"&&saved.ClaudeModel=="claude-test"&&saved.Model=="gpt-test","Provider model preferences lost.");
        });
        return passed;
    }
}
