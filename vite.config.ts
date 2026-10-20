import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';

// Local Wi-Fi / LAN Realtime Relay Plugin for instant multi-device testing during `npm run dev`
function duelLanRelayPlugin(): Plugin {
  const rooms = new Map<string, Set<ServerResponse>>();

  return {
    name: 'duel-lan-relay',
    configureServer(server) {
      server.middlewares.use('/__duel_relay', (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const room = (url.searchParams.get('room') || '').toUpperCase();

        // CORS headers for local network devices
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // GET: Subscribe to room events via Server-Sent Events (SSE)
        if (req.method === 'GET' && room) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
          });
          res.write('data: {"type":"CONNECTED"}\n\n');

          if (!rooms.has(room)) {
            rooms.set(room, new Set());
          }
          const clients = rooms.get(room)!;
          clients.add(res);

          req.on('close', () => {
            clients.delete(res);
            if (clients.size === 0) {
              rooms.delete(room);
            }
          });
          return;
        }

        // POST: Broadcast event to all devices in the room
        if (req.method === 'POST' && room) {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            const clients = rooms.get(room);
            if (clients) {
              const payload = `data: ${body}\n\n`;
              clients.forEach(client => {
                if (!client.writableEnded) {
                  client.write(payload);
                }
              });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          });
          return;
        }

        res.statusCode = 400;
        res.end();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), duelLanRelayPlugin()],
});
