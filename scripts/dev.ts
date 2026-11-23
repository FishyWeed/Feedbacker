// Starts the API server (port 3000, restarts on change) and the Vite dev server (port 5173) together.
export {};

const bun = process.execPath;
const procs = [
  Bun.spawn([bun, '--watch', 'server/index.ts'], { stdio: ['inherit', 'inherit', 'inherit'] }),
  Bun.spawn([bun, 'x', '--bun', 'vite'], { stdio: ['inherit', 'inherit', 'inherit'] }),
];
const shutdown = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await Promise.race(procs.map((p) => p.exited));
shutdown();
