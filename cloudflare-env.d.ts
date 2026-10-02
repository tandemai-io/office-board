declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SECRET_ENCRYPTION_KEY?: string;
    CONTROLLER_TOKEN?: string;
    OWNER_EMAIL?: string;
    SCHEDULER_MINUTES?: string;
    BUCKET?: R2Bucket;
  }
}
