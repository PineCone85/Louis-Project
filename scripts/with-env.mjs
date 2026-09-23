/**
 * Runs a command with the variables from an env file layered on top of the
 * current environment (the file wins on conflicts).
 *
 *   node scripts/with-env.mjs .env.demo next dev -p 3001
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const [file, command, ...args] = process.argv.slice(2);
if (!file || !command) {
  console.error("Usage: node scripts/with-env.mjs <env-file> <command> [args...]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`[with-env] ${file} not found.`);
  process.exit(1);
}
config({ path: file, override: true, quiet: true });

// Prefer a locally installed binary (node_modules/.bin) so the script works
// when invoked directly as well as through npm scripts.
const localBin = path.join(process.cwd(), "node_modules", ".bin", command);
const executable = existsSync(localBin) ? localBin : command;

const child = spawn(executable, args, { stdio: "inherit", env: process.env });
child.on("error", (error) => {
  console.error(`[with-env] failed to start ${command}:`, error.message);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
