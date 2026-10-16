declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SECRET_ENCRYPTION_KEY?: string;
    CONTROLLER_TOKEN?: string;
    OWNER_EMAIL?: string;
    ENGINEERING_REPOSITORY?: string;
    ENGINEERING_BRANCH?: string;
    ENGINEERING_WORKFLOWS?: string;
    ENGINEERING_HEALTH_URL?: string;
    ENGINEERING_WEBHOOK_SECRET?: string;
    ENGINEERING_RUNNER_TOKEN?: string;
    SCHEDULER_MINUTES?: string;
    BUCKET?: R2Bucket;
  }
}
