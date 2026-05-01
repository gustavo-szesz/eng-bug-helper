import { Command } from "commander";
import { createSnapshot, readSnapshot } from "./snapshot.js";
import { runReplay, startReplaySandbox } from "./replay.js";

const program = new Command();

program
  .name("bugtool")
  .description("BugSnapshot + Replay Sandbox for HubSpot integration debugging")
  .version("0.1.0");

program
  .command("snapshot:create")
  .requiredOption("-i, --input <path>", "Path to raw incident JSON")
  .option("-o, --output <path>", "Output snapshot path")
  .action(async (options: { input: string; output?: string }) => {
    const saved = await createSnapshot(options.input, options.output);
    process.stdout.write(`Snapshot created: ${saved}\n`);
  });

program
  .command("replay:serve")
  .requiredOption("-s, --snapshot <path>", "Path to snapshot file")
  .option("-p, --port <number>", "Port for local sandbox", "4010")
  .action(async (options: { snapshot: string; port: string }) => {
    const snapshot = await readSnapshot(options.snapshot);
    await startReplaySandbox(snapshot, Number(options.port));
  });

program
  .command("replay:run")
  .requiredOption("-s, --snapshot <path>", "Path to snapshot file")
  .option("-b, --base-url <url>", "Target replay base URL", "http://localhost:4010")
  .option("-t, --timeout-ms <number>", "HTTP timeout in milliseconds", "10000")
  .action(async (options: { snapshot: string; baseUrl: string; timeoutMs: string }) => {
    const snapshot = await readSnapshot(options.snapshot);
    await runReplay(snapshot, options.baseUrl, Number(options.timeoutMs));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
