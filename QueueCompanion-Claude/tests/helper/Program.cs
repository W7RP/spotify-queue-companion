using System.Net;
using System.Text;
using System.Text.Json;
using QueueCompanion;

var root = Path.Combine(Path.GetTempPath(), "QueueCompanion-tests-" + Guid.NewGuid());
var store = new Storage(root); var passed = 0;
void Assert(bool value, string message) { if (!value) throw new Exception(message); }
async Task Test(string name, Func<Task> body) { await body(); passed++; Console.WriteLine("PASS " + name); }
async Task Reject(Func<Task> body, string expected) { try { await body(); } catch (InvalidOperationException e) { Assert(e.Message.Contains(expected), "Wrong error: " + e.Message); return; } throw new Exception("Operation unexpectedly succeeded."); }
void Credentials() => store.WriteSecret("credentials.dat", new Registration("test-registration", "test-subject", "test@example.invalid", null, "FAKE_TEST_ACCESS_ONLY", "FAKE_TEST_REFRESH_ONLY", ["chatgpt.tokens.use.direct"], DateTimeOffset.UtcNow.AddHours(1), DateTimeOffset.UtcNow));
var track = new Track("0000000000000000000001", "spotify:track:0000000000000000000001", "Candidate", "Artist");
string Stream(string answer, bool completed = true) => "data: " + JsonSerializer.Serialize(new { type = "response.output_text.delta", delta = answer }) + "\n\n" + (completed ? "data: {\"type\":\"response.completed\"}\n\n" : "");
async Task<Selection> Select(string stream, bool restricted = true, HttpStatusCode status = HttpStatusCode.OK)
{
    Credentials();
    using var client = new HttpClient(new FakeHandler(async request => {
        if (request.RequestUri!.AbsolutePath == "/v1/models") return new(HttpStatusCode.OK) { Content = new StringContent("{\"models\":[{\"slug\":\"test-luna\",\"display_name\":\"Test model\",\"visibility\":\"list\"}]}") };
        using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
        Assert(body.RootElement.GetProperty("stream").GetBoolean(), "Streaming must be enabled.");
        Assert(!body.RootElement.GetProperty("store").GetBoolean(), "Store must be false.");
        Assert(!body.RootElement.TryGetProperty("max_output_tokens", out _), "Unsupported API field.");
        Assert(!body.RootElement.GetProperty("input")[0].GetProperty("content").GetString()!.Contains("spotify:track:"), "Unnecessary catalogue URIs sent to inference.");
        return new(status) { Content = new StringContent(stream, Encoding.UTF8, "text/event-stream") };
    }));
    return await new ChatGptProvider(new OAuth(store, client), client).Select(new("Only liked mellow songs", 1, [track], restricted), null, default);
}
try
{
    await Test("custom Spotify detection skips stale defaults and rejects Store aliases",()=>{
        var custom=Path.Combine(root,"Music Apps","Spotify","Spotify.exe");var data=Path.GetDirectoryName(custom)!;
        var stale=Path.Combine(root,"missing","Spotify.exe");var storeAlias=Path.Combine(root,"Microsoft","WindowsApps","Spotify.exe");
        var calls=new List<string>();var selected=QueueCompanion.Setup.SpotifyLocator.Select([stale,storeAlias,custom,custom],p=>{calls.Add(p);return p==custom?new SpotifyInstallation(p,data):null;});
        Assert(selected?.Executable==custom&&calls.SequenceEqual(new[]{stale,custom}),"Custom location not selected or Store alias accepted.");return Task.CompletedTask;
    });
    await Test("Spotify paths preserve spaces and apostrophes and reject command arguments",()=>{
        var custom=Path.Combine(root,"O'Connor Music","Spotify.exe");
        Assert(QueueCompanion.Setup.SpotifyLocator.Normalize("\""+custom+"\",0")==custom,"Quoted registry icon path failed.");
        Assert(QueueCompanion.Setup.SpotifyLocator.Normalize(custom+" --uninstall")==null,"Command arguments accepted as a path.");
        Assert(QueueCompanion.Setup.SpotifyLocator.Normalize("Spotify.exe")==null,"Relative path accepted.");return Task.CompletedTask;
    });
    await Test("IPC trusts only the selected Spotify executable at its exact path",()=>{
        var custom=Path.Combine(root,"Custom","Spotify.exe");
        Assert(SpotifyInstallation.MatchesPeer(custom,custom),"Selected custom Spotify peer rejected.");
        Assert(!SpotifyInstallation.MatchesPeer(Path.Combine(root,"Other","Spotify.exe"),custom),"Another same-name process accepted.");
        Assert(!SpotifyInstallation.MatchesPeer(Path.Combine(root,"Custom","browser.exe"),custom),"Foreign executable accepted.");return Task.CompletedTask;
    });
    await Test("DPAPI encrypted round-trip; plaintext absent on disk", () => { Credentials(); Assert(store.ReadSecret<Registration>("credentials.dat")!.AccessToken == "FAKE_TEST_ACCESS_ONLY", "DPAPI round-trip failed."); Assert(!Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(root, "credentials.dat"))).Contains("FAKE_TEST_ACCESS_ONLY"), "Plaintext leaked."); return Task.CompletedTask; });
    await Test("streaming contract and valid completed selection", async () => { var s = await Select("" + Stream("{\"ids\":[\"" + track.Id + "\"],\"suggestions\":[]}")); Assert(s.Ids.Single() == track.Id, "Wrong candidate."); });
    await Test("truncated inference never becomes a selection", () => Reject(() => Select(Stream("{\"ids\":[\"" + track.Id + "\"]}", false)), "ended before completion"));
    await Test("terminal provider failure rejects partial output", () => Reject(() => Select("data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"usage_limit\"}}}\n\n"), "usage_limit"));
    await Test("fabricated IDs are rejected", () => Reject(() => Select(Stream("{\"ids\":[\"unknown\"]}")), "invalid candidate"));
    await Test("restricted library cannot accept catalogue suggestions", () => Reject(() => Select(Stream("{\"ids\":[],\"suggestions\":[{\"title\":\"Other song\",\"artist\":\"Other\"}]}")), "requested library"));
    await Test("quota errors remain explicit", () => Reject(() => Select("", true, HttpStatusCode.TooManyRequests), "usage limit"));
    await Test("identity-only scope cannot perform inference", async () => { Credentials(); var c = store.ReadSecret<Registration>("credentials.dat")!; store.WriteSecret("credentials.dat", c with { Scopes = ["openid"] }); using var client = new HttpClient(new FakeHandler(_ => throw new Exception("Network must not be reached."))); await Reject(() => new OAuth(store, client).Access(default), "not authorized"); });
    await Test("concurrent access rotates the refresh token once", async () => { Credentials(); var c=store.ReadSecret<Registration>("credentials.dat")!;store.WriteSecret("credentials.dat",c with{Expires=DateTimeOffset.UtcNow.AddMinutes(-1)});var calls=0;using var client=new HttpClient(new FakeHandler(async request=>{calls++;await Task.Delay(25);var form=await request.Content!.ReadAsStringAsync();Assert(form.Contains("client_id=test-registration")&&!form.Contains("dynamic_agent_client"),"Refresh used wrong registration.");return new(HttpStatusCode.OK){Content=new StringContent("{\"access_token\":\"FAKE_ROTATED_ACCESS\",\"refresh_token\":\"FAKE_ROTATED_REFRESH\",\"expires_in\":3600}")};}));var auth=new OAuth(store,client);var values=await Task.WhenAll(auth.Access(default),auth.Access(default));Assert(calls==1&&values.All(x=>x=="FAKE_ROTATED_ACCESS"),"Refresh was not serialized.");Assert(store.ReadSecret<Registration>("credentials.dat")!.RefreshToken=="FAKE_ROTATED_REFRESH","Rotation not saved."); });
    await Test("revoked refresh grant clears tokens without retrying", async () => { Credentials();var c=store.ReadSecret<Registration>("credentials.dat")!;store.WriteSecret("credentials.dat",c with{Expires=DateTimeOffset.UtcNow.AddMinutes(-1)});using var client=new HttpClient(new FakeHandler(_=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadRequest){Content=new StringContent("{\"error\":\"invalid_grant\"}")})));await Reject(()=>new OAuth(store,client).Access(default),"revoked");Assert(store.ReadSecret<Registration>("credentials.dat")!.RefreshToken==null,"Revoked grant retained."); });
    await Test("failed network revocation still erases local tokens", async () => { Credentials(); using var client = new HttpClient(new FakeHandler(_ => throw new HttpRequestException("Offline test"))); try { await new OAuth(store, client).Disconnect(); } catch (HttpRequestException) { } var c = store.ReadSecret<Registration>("credentials.dat")!; Assert(c.AccessToken == null && c.RefreshToken == null && c.IdToken == null, "Local disconnect did not erase tokens."); });
    await Test("unsolicited OAuth callback is rejected", async () => { using var client = new HttpClient(); await Reject(() => new OAuth(store, client).Complete(new QueryCollection()), "No pending"); });
    await Test("history threshold, session deduplication and account partition", () => {
        var history = new History(store); var listen = new Listen(track.Uri, track.Title, track.Artist, "session", 29_999, DateTimeOffset.UtcNow);
        history.Observe("account-a", listen, 200_000); var rank = JsonSerializer.SerializeToElement(history.Rank("account-a", 10, 30), Storage.Json); Assert(rank.GetProperty("tracks").GetArrayLength() == 0, "Skip counted.");
        history.Observe("account-a", listen with { Milliseconds = 30_000 }, 200_000); history.Observe("account-a", listen with { Milliseconds = 31_000 }, 200_000);
        rank = JsonSerializer.SerializeToElement(history.Rank("account-a", 10, 30), Storage.Json); Assert(rank.GetProperty("tracks")[0].GetProperty("plays").GetInt32() == 1, "Session counted twice.");
        var other = JsonSerializer.SerializeToElement(history.Rank("account-b", 10, 30), Storage.Json); Assert(other.GetProperty("tracks").GetArrayLength() == 0, "Account history leaked."); Assert(!rank.GetProperty("historicalSpotifyCountsAvailable").GetBoolean(), "Misleading history coverage."); return Task.CompletedTask;
    });
    passed += await ClaudeTests.Run(Path.Combine(root, "Claude"));
    passed += MinimalRuntimeTests.Run(root);
    Console.WriteLine($"{passed} helper tests passed (isolated stubs; no live acceptance claim).");
}
finally { if (Path.GetFullPath(root).StartsWith(Path.GetFullPath(Path.GetTempPath()) + "QueueCompanion-tests-", StringComparison.OrdinalIgnoreCase)) Directory.Delete(root, true); }

sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> responder) : HttpMessageHandler
{ protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => responder(request); }
