import app from './app';

function startServer(preferredPort: number) {
  const server = app.listen(preferredPort, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : preferredPort;
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${actualPort}`);
  });
  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE' && preferredPort !== 0) {
      // eslint-disable-next-line no-console
      console.warn(`Port ${preferredPort} in use, retrying on an ephemeral port...`);
      startServer(0);
    } else {
      throw err;
    }
  });
}

const preferredPort = Number(process.env.PORT || 3000);
startServer(preferredPort);

export default app;

