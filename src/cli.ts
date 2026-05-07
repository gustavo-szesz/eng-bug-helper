import { Command } from "commander";
import { readFileSync } from "node:fs";
import { createSnapshot, readSnapshot } from "./snapshot.js";
import { runReplay, startReplaySandbox } from "./replay.js";
import { createIssueReport } from "./report.js";
import { createSlackThread } from "./slack-thread.js";

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

program
  .command("report:create")
  .requiredOption("-i, --input <path>", "Path to snapshot or browser incident JSON")
  .option("-o, --output <path>", "Output directory or markdown file path")
  .action(async (options: { input: string; output?: string }) => {
    const { markdownPath, jsonPath } = await createIssueReport(options.input, options.output);
    process.stdout.write(`Report created: ${markdownPath}\n`);
    process.stdout.write(`Draft JSON: ${jsonPath}\n`);
  });

program
  .command("thread:create")
  .requiredOption("-i, --input <path>", "Path to report JSON file")
  .option("--org-id <id>", "OrgId to override URL extraction")
  .option("--client-name <name>", "Client name")
  .option("--mentions <list>", "Comma-separated mentions (e.g., '@john,@jane')")
  .option("--useful-links <list>", "Comma-separated useful links")
  .option("--description <text>", "Humanized error description")
  .action(
    async (options: {
      input: string;
      orgId?: string;
      clientName?: string;
      mentions?: string;
      usefulLinks?: string;
      description?: string;
    }) => {
      const mentions = options.mentions
        ? options.mentions.split(",").map((m) => m.trim())
        : [];
      const usefulLinks = options.usefulLinks
        ? options.usefulLinks.split(",").map((link) => link.trim())
        : [];

      const { threadTextPath, threadJsonPath } = await createSlackThread(options.input, {
        orgId: options.orgId,
        clientName: options.clientName,
        mentions,
        usefulLinks,
        humanDescription: options.description
      });

      const threadContent = readFileSync(threadTextPath, "utf-8");
      process.stdout.write(`Slack thread text: ${threadTextPath}\n`);
      process.stdout.write(`Slack thread JSON: ${threadJsonPath}\n`);
      process.stdout.write("\n");
      process.stdout.write("--- COPY/PASTE TO SLACK ---\n");
      process.stdout.write(`${threadContent}\n`);
    }
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
