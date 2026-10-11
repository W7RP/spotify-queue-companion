namespace QueueCompanion;

public record Listen(string Uri, string Title, string Artist, string Session, int Milliseconds, DateTimeOffset At);
public record HistoryState(DateTimeOffset Since, List<Listen> Events);
public sealed class History(Storage store)
{
    readonly object gate = new();
    string Name(string account) => "history-" + Storage.Key(account) + ".json";
    public object Status(string account)
    {
        lock (gate) { var state = Get(account); return new { since = state.Since, meaningfulPlays = state.Events.Count, coverage = "Locally observed since " + state.Since.ToString("yyyy-MM-dd HH:mm 'UTC'"), threshold = "At least 30 seconds or half the track, whichever is shorter. Pauses, seeks and disconnected time are excluded." }; }
    }
    HistoryState Get(string account)
    {
        var stored = store.Read<HistoryState>(Name(account)); if (stored != null) return stored;
        var initial = new HistoryState(DateTimeOffset.UtcNow, []); store.Write(Name(account), initial); return initial;
    }
    public void Observe(string account, Listen listen, int duration)
    {
        if (!listen.Uri.StartsWith("spotify:track:") || listen.Session.Length > 100 || listen.Milliseconds < Math.Min(30_000, duration / 2) || duration < 1000 || listen.At < DateTimeOffset.UtcNow.AddDays(-1) || listen.At > DateTimeOffset.UtcNow.AddMinutes(1)) return;
        lock (gate)
        {
            var state = Get(account);
            if (state.Events.Any(x => x.Session == listen.Session)) return;
            if (listen.At < state.Since) state = state with { Since = listen.At };
            state.Events.Add(listen);
            state.Events.RemoveAll(x => x.At < DateTimeOffset.UtcNow.AddDays(-90));
            if (state.Events.Count > 20_000) state.Events.RemoveRange(0, state.Events.Count - 20_000);
            store.Write(Name(account), state);
        }
    }
    public object Rank(string account, int count, int days)
    {
        lock (gate)
        {
            var state = Get(account); var start = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(days, 1, 90)); if (state.Since > start) start = state.Since;
            var tracks = state.Events.Where(x => x.At >= start).GroupBy(x => x.Uri).OrderByDescending(g => g.Count()).ThenByDescending(g => g.Max(x => x.At)).Take(count).Select(g => new { uri = g.Key, title = g.Last().Title, artist = g.Last().Artist, plays = g.Count() }).ToArray();
            return new { tracks, since = start, coverage = "Locally observed plays since " + start.ToString("yyyy-MM-dd HH:mm 'UTC'"), historicalSpotifyCountsAvailable = false };
        }
    }
    public void Clear(string account) { lock (gate) store.Delete(Name(account)); }
}
