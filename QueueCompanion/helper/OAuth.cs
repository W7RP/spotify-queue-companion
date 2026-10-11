using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace QueueCompanion;

public sealed class OAuth(Storage store, HttpClient http)
{
    const string Issuer = "https://auth.openai.com";
    const string TokenUrl = Issuer + "/api/accounts/oauth/token";
    const string Resource = "https://api.openai.com/v1";
    readonly SemaphoreSlim refreshLock = new(1, 1);
    readonly object gate = new();
    Attempt? pending;
    string? lastError;
    long grantEpoch;
    record Attempt(string State, string Nonce, string Verifier, string Redirect, string? ClientId, string? Subject, DateTimeOffset Started, long Epoch);
    record IssuedRegistration(string ClientId);
    public Registration? Current => store.ReadSecret<Registration>("credentials.dat");
    public object Status() { var c = Current; return new { connected = c?.AccessToken != null, email = c?.Email, planUsage = c?.Scopes.Contains("chatgpt.tokens.use.direct") ?? false, pending = pending != null, error = lastError }; }
    public string Start(int port, bool newAccount = false)
    {
        lock (gate)
        {
            var c = newAccount ? null : Current;
            var issued = newAccount ? null : store.ReadSecret<IssuedRegistration>("pending-registration.dat");
            var client = c?.ClientId ?? issued?.ClientId;
            var host = store.Read<string>("host.json") ?? "urn:uuid:" + Guid.NewGuid();
            store.Write("host.json", host);
            var a = new Attempt(Random(), Random(), Random(64), $"http://127.0.0.1:{port}/auth/callback", client, c?.Subject, DateTimeOffset.UtcNow, ++grantEpoch);
            pending = a; lastError = null;
            var q = new Dictionary<string, string>
            {
                ["client_id"] = client ?? "dynamic_agent_client", ["ext_agent_host_id"] = host,
                ["response_type"] = "code", ["redirect_uri"] = a.Redirect,
                ["scope"] = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", ["resource"] = Resource,
                ["state"] = a.State, ["nonce"] = a.Nonce, ["code_challenge_method"] = "S256",
                ["code_challenge"] = B64(SHA256.HashData(Encoding.ASCII.GetBytes(a.Verifier)))
            };
            if (client == null) q["agent_name_hint"] = "Queue Companion";
            else if (c != null)
            { if (c.IdToken != null) q["id_token_hint"] = c.IdToken; q["login_hint"] = c.Email; }
            var url = Issuer + "/api/accounts/authorize?" + string.Join("&", q.Select(p => Uri.EscapeDataString(p.Key) + "=" + Uri.EscapeDataString(p.Value)));
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            return "Complete sign-in in your browser. Eligible ChatGPT plan usage requires separate consent.";
        }
    }
    public async Task Complete(IQueryCollection query)
    {
        Attempt a;
        lock (gate)
        {
            a = pending ?? throw new InvalidOperationException("No pending sign-in.");
            if (DateTimeOffset.UtcNow - a.Started > TimeSpan.FromMinutes(10) || !Fixed(query["state"].ToString(), a.State)) throw new InvalidOperationException("Sign-in state invalid or expired.");
            pending = null;
        }
        try
        {
            if (query.ContainsKey("error")) throw new InvalidOperationException("Sign-in was declined. Try Continue with ChatGPT again.");
            var client = query["client_id"].ToString();
            if (a.ClientId != null && client.Length > 0 && client != a.ClientId) throw new InvalidOperationException("Registration did not match the selected account.");
            client = a.ClientId ?? client;
            if (string.IsNullOrEmpty(client) || client == "dynamic_agent_client") throw new InvalidOperationException("Sign-in did not return an issued client ID.");
            // Retain issued registration even when code exchange fails, without trusting callback identity.
            store.WriteSecret("pending-registration.dat", new IssuedRegistration(client));
            var code = query["code"].ToString();
            if (string.IsNullOrEmpty(code)) throw new InvalidOperationException("Sign-in returned no authorization code.");
            using var token = await Exchange(new() { ["grant_type"] = "authorization_code", ["client_id"] = client, ["code"] = code, ["code_verifier"] = a.Verifier, ["redirect_uri"] = a.Redirect, ["resource"] = Resource });
            var id = token.RootElement.GetProperty("id_token").GetString()!;
            using var claims = await ValidateId(id, client, a.Nonce);
            var subject = claims.RootElement.GetProperty("sub").GetString()!;
            if (a.Subject != null && a.Subject != subject) throw new InvalidOperationException("Sign-in returned a different account.");
            var email = claims.RootElement.TryGetProperty("email", out var e) ? e.GetString()! : subject;
            await refreshLock.WaitAsync();
            try { lock(gate) { if(grantEpoch!=a.Epoch)throw new InvalidOperationException("Sign-in was superseded or disconnected.");store.WriteSecret("credentials.dat", Parse(token.RootElement, client, subject, email, id));store.Delete("pending-registration.dat"); } }
            finally { refreshLock.Release(); }
        }
        catch (Exception e) { lastError = e is HttpRequestException ? "Sign-in network request failed. Try again." : e.Message; throw; }
    }
    public async Task<string> Access(CancellationToken ct)
    {
        await refreshLock.WaitAsync(ct);
        try
        {
            var c = Current ?? throw new InvalidOperationException("Connect ChatGPT in settings first.");
            if (!c.Scopes.Contains("chatgpt.tokens.use.direct")) throw new InvalidOperationException("ChatGPT plan usage was not authorized. Reconnect and grant inference permission.");
            if (c.AccessToken != null && c.Expires > DateTimeOffset.UtcNow.AddMinutes(2)) return c.AccessToken;
            if (c.RefreshToken == null) throw new InvalidOperationException("ChatGPT connection expired. Reconnect in settings.");
            if (c.EarliestRefresh > DateTimeOffset.UtcNow) throw new InvalidOperationException("ChatGPT token renewal is not available yet. Retry shortly.");
            JsonDocument result;
            try {result=await Exchange(new() { ["grant_type"] = "refresh_token", ["client_id"] = c.ClientId, ["refresh_token"] = c.RefreshToken, ["resource"] = Resource }, ct);}
            catch(OAuthTokenError e) when(e.InvalidGrant) {store.WriteSecret("credentials.dat",c with{AccessToken=null,RefreshToken=null,IdToken=null,Scopes=[]});throw new InvalidOperationException("ChatGPT connection was revoked or expired. Reconnect in settings.");}
            using var token = result;
            var updated = Parse(token.RootElement, c.ClientId, c.Subject, c.Email, c.IdToken, c.Scopes);
            store.WriteSecret("credentials.dat", updated);
            return updated.AccessToken ?? throw new InvalidOperationException("ChatGPT returned no inference token.");
        }
        finally { refreshLock.Release(); }
    }
    public async Task Disconnect()
    {
        await refreshLock.WaitAsync();
        Registration? c = null;
        try
        {
            lock (gate) { pending = null; grantEpoch++; }
            c = Current;
            if (c?.RefreshToken != null)
            {
                using var discovery = JsonDocument.Parse(await http.GetStringAsync(Issuer + "/.well-known/openid-configuration"));
                var endpoint = discovery.RootElement.GetProperty("revocation_endpoint").GetString()!;
                RequireIssuerUrl(endpoint);
                using var response = await http.PostAsync(endpoint, new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = c.RefreshToken, ["token_type_hint"] = "refresh_token", ["client_id"] = c.ClientId }));
                if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Could not revoke the ChatGPT session. Retry, or revoke Queue Companion in ChatGPT settings.");
            }
            // Preserve issued registration and verified identity for reauthorization, remove every token and hint.
            lastError = null;
        }
        finally
        {
            if (c != null) store.WriteSecret("credentials.dat", c with { AccessToken = null, RefreshToken = null, IdToken = null, Scopes = [] });
            store.Delete("pending-registration.dat");
            refreshLock.Release();
        }
    }
    async Task<JsonDocument> Exchange(Dictionary<string, string> fields, CancellationToken ct = default)
    {
        using var response = await http.PostAsync(TokenUrl, new FormUrlEncodedContent(fields), ct);
        if (!response.IsSuccessStatusCode) {var invalid=false;try{using var error=JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));invalid=error.RootElement.TryGetProperty("error",out var code)&&code.ValueKind==JsonValueKind.String&&code.GetString()=="invalid_grant";}catch(JsonException){}throw new OAuthTokenError((int)response.StatusCode,invalid);}
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }
    static Registration Parse(JsonElement t, string client, string subject, string email, string? id, string[]? fallbackScopes = null)
    {
        string? S(string p) => t.TryGetProperty(p, out var x) ? x.GetString() : null;
        var now = DateTimeOffset.UtcNow;
        var earliest = t.TryGetProperty("earliest_refresh_at", out var r) && r.ValueKind == JsonValueKind.Number ? DateTimeOffset.FromUnixTimeSeconds(r.GetInt64()) : now;
        return new(client, subject, email, id, S("access_token"), S("refresh_token"), S("scope")?.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? fallbackScopes ?? [], now.AddSeconds(t.GetProperty("expires_in").GetInt32()), earliest);
    }
    async Task<JsonDocument> ValidateId(string jwt, string client, string nonce)
    {
        var parts = jwt.Split('.'); if (parts.Length != 3) throw new InvalidOperationException("Invalid identity token.");
        using var header = JsonDocument.Parse(UnB64(parts[0]));
        if (header.RootElement.GetProperty("alg").GetString() != "RS256") throw new InvalidOperationException("Unsupported identity signature.");
        using var discovery = JsonDocument.Parse(await http.GetStringAsync(Issuer + "/.well-known/openid-configuration"));
        if (discovery.RootElement.GetProperty("issuer").GetString() != Issuer) throw new InvalidOperationException("Unexpected identity issuer.");
        var jwks = discovery.RootElement.GetProperty("jwks_uri").GetString()!; RequireIssuerUrl(jwks);
        using var keys = JsonDocument.Parse(await http.GetStringAsync(jwks));
        var kid = header.RootElement.GetProperty("kid").GetString();
        var key = keys.RootElement.GetProperty("keys").EnumerateArray().Single(k => k.GetProperty("kid").GetString() == kid && k.GetProperty("kty").GetString() == "RSA");
        using var rsa = RSA.Create(); rsa.ImportParameters(new RSAParameters { Modulus = UnB64(key.GetProperty("n").GetString()!), Exponent = UnB64(key.GetProperty("e").GetString()!) });
        if (!rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]), UnB64(parts[2]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) throw new InvalidOperationException("Identity signature invalid.");
        var payload = JsonDocument.Parse(UnB64(parts[1])); var p = payload.RootElement;
        var aud = p.GetProperty("aud"); var audienceOk = aud.ValueKind == JsonValueKind.String ? aud.GetString() == client : aud.EnumerateArray().Any(x => x.GetString() == client);
        if (p.GetProperty("iss").GetString() != Issuer || !audienceOk || p.GetProperty("exp").GetInt64() <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() || !Fixed(p.GetProperty("nonce").GetString()!, nonce) || string.IsNullOrEmpty(p.GetProperty("sub").GetString())) { payload.Dispose(); throw new InvalidOperationException("Identity validation failed."); }
        return payload;
    }
    static void RequireIssuerUrl(string url) { var u = new Uri(url); if (u.Scheme != "https" || u.Host != "auth.openai.com") throw new InvalidOperationException("Untrusted identity endpoint."); }
    public static string Random(int size = 32) => B64(RandomNumberGenerator.GetBytes(size));
    public static string B64(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] UnB64(string value) { value = value.Replace('-', '+').Replace('_', '/'); return Convert.FromBase64String(value.PadRight((value.Length + 3) / 4 * 4, '=')); }
    public static bool Fixed(string a, string b) => CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
sealed class OAuthTokenError(int status,bool invalidGrant):InvalidOperationException($"ChatGPT token exchange failed ({status}). Reconnect; no tokens were logged.") {public bool InvalidGrant{get;}=invalidGrant;}
