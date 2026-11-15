// Starts the Next.js dev server connected to the local Firebase emulators
// instead of the live project. Run `npm run emulators` first.
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_USE_EMULATORS: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
