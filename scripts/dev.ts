// Starts the Vite dev server (port 4200, the one you open) and the API server behind it (port 4201, restarts on change).
export {};

const bun = process.execPath;
const procs = [
  Bun.spawn([bun, '--watch', 'server/index.ts'], { stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, PORT: '4201' } }),
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
