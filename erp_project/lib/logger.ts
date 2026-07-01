import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import chalk from "chalk";

// ── level colors ───────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<string, (s: string) => string> = {
  error: (s) => chalk.red(s),
  warn:  (s) => chalk.yellow(s),
  info:  (s) => chalk.cyan(s),
  debug: (s) => chalk.dim(s),
};

// ── fields excluded from extras line ──────────────────────────────────────

const SKIP = new Set(["service", "stack", "splat", "pid"]);

// ── pretty format (console only) ──────────────────────────────────────────

const prettyFormat = winston.format.printf(({ timestamp, level, message, requestId, module, deltaMs, stack, ...meta
}: any) => {
  const ts    = new Date(timestamp).toISOString().substring(11, 23);
  const req   = requestId ? String(requestId).substring(0, 8) : "--------";
  const delta = deltaMs != null ? `+${deltaMs}ms`.padEnd(8) : " ".repeat(8);
  const mod   = `[${String(module ?? "APP")}]`.padEnd(16);
  const lvl   = level.toUpperCase().padEnd(5);
  const color = LEVEL_COLOR[level] ?? ((s: string) => s);

  const extras = Object.entries(meta)
    .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined)
    .map(([k, v]) => `${chalk.dim(k + "=")}${JSON.stringify(v)}`)
    .join("  ");

  const header = [
    chalk.dim(ts),
    chalk.dim(delta),
    color(lvl),
    chalk.dim(`[req:${req}]`),
    chalk.magenta(mod),
    message,
  ].join("  ");

  const lines = [header];
  if (extras) lines.push(`  ${chalk.dim("│")}  ${extras}`);
  if (stack)  lines.push(`  ${chalk.dim(stack)}`);
  return lines.join("\n");
});

// ── format per transport ───────────────────────────────────────────────────

const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  prettyFormat,
);

// Files stay as JSON — no ANSI codes, easy to grep / ingest into log tools
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

// ── logger ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),

    new DailyRotateFile({
      format: fileFormat,
      filename: "logs/app-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      maxSize: "20m",
    }),

    new DailyRotateFile({
      level: "error",
      format: fileFormat,
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
    }),
  ],
});

export default logger;