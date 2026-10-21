declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_ORIGIN?: string;
    DATA_ENCRYPTION_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
    PC_BRIDGE_TOKEN_HASH?: string;
    SPOTIFY_REPLACE_ENABLED?: string;
  }
}
