import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import Peer, { DataConnection } from 'peerjs';
import { MultiplayerEvent } from '../types/multiplayer';

export type MessageHandler = (event: MultiplayerEvent) => void;
export type ConnectionStatusHandler = (status: 'connected' | 'connecting' | 'disconnected') => void;

export interface RealtimeAdapter {
  connect(
    roomCode: string,
    playerId: string,
    isHost: boolean,
    onMessage: MessageHandler,
    onStatusChange: ConnectionStatusHandler
  ): void;
  send(event: MultiplayerEvent): void;
  disconnect(): void;
  getTransportName(): string;
}

interface WrappedEnvelope {
  _msgId: string;
  _senderId: string;
  event: MultiplayerEvent;
}

// 1. Supabase Realtime Provider (When VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY are set)
class SupabaseRealtimeProvider implements RealtimeAdapter {
  private channel: RealtimeChannel | null = null;
  private supabase: ReturnType<typeof createClient> | null = null;

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  getTransportName(): string {
    return 'Supabase Cloud Realtime';
  }

  connect(
    roomCode: string,
    playerId: string,
    _isHost: boolean,
    onMessage: MessageHandler,
    onStatusChange: ConnectionStatusHandler
  ): void {
    if (!this.supabase) return;
    onStatusChange('connecting');

    const channelName = `sudoku_duel_${roomCode.toUpperCase()}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: playerId },
      },
    });

    this.channel
      .on('broadcast', { event: 'duel_message' }, ({ payload }) => {
        onMessage(payload as MultiplayerEvent);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach(p => {
          if (p.presence_ref) {
            onMessage({ type: 'PLAYER_LEFT', playerId: (p as unknown as { key?: string }).key || '' });
          }
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          onStatusChange('connected');
          this.channel?.track({ online_at: Date.now() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          onStatusChange('disconnected');
        }
      });
  }

  send(event: MultiplayerEvent): void {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'duel_message',
        payload: event,
      });
    }
  }

  disconnect(): void {
    if (this.channel && this.supabase) {
      this.channel.unsubscribe();
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

// 2. Hybrid Multi-Transport Provider:
// Combines:
//   a) Vite Local Wi-Fi / LAN SSE Relay (works across phones & PCs on same Wi-Fi)
//   b) PeerJS WebRTC P2P (works on Vercel & Internet across any devices with 0 config)
//   c) BroadcastChannel (instant same-browser multi-tab sync)
class HybridRealtimeProvider implements RealtimeAdapter {
  private roomCode: string = '';
  private playerId: string = '';
  private seenMsgIds = new Set<string>();
  private onMessageCallback: MessageHandler | null = null;

  // Transport A: BroadcastChannel (same browser)
  private bc: BroadcastChannel | null = null;

  // Transport B: Vite LAN SSE Relay (same Wi-Fi in dev mode)
  private sse: EventSource | null = null;
  private lanAvailable: boolean = false;

  // Transport C: PeerJS WebRTC (Cross-device Wi-Fi & Vercel Internet)
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];

  getTransportName(): string {
    return 'Wi-Fi & WebRTC P2P Realtime';
  }

  private handleIncomingEnvelope(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const env = raw as WrappedEnvelope;
    if (!env._msgId || !env.event) return;

    // Ignore our own messages or already processed messages
    if (env._senderId === this.playerId) return;
    if (this.seenMsgIds.has(env._msgId)) return;

    this.seenMsgIds.add(env._msgId);
    if (this.seenMsgIds.size > 500) {
      const first = this.seenMsgIds.values().next().value;
      if (first) this.seenMsgIds.delete(first);
    }

    this.onMessageCallback?.(env.event);
  }

  connect(
    roomCode: string,
    playerId: string,
    isHost: boolean,
    onMessage: MessageHandler,
    onStatusChange: ConnectionStatusHandler
  ): void {
    this.roomCode = roomCode.toUpperCase();
    this.playerId = playerId;
    this.onMessageCallback = onMessage;
    onStatusChange('connecting');

    let isConnectedReported = false;
    const markConnected = () => {
      if (!isConnectedReported) {
        isConnectedReported = true;
        onStatusChange('connected');
      }
    };

    // ---------------------------------------------------------
    // A. Same-Browser BroadcastChannel
    // ---------------------------------------------------------
    try {
      this.bc = new BroadcastChannel(`sudoku_duel_${this.roomCode}`);
      this.bc.onmessage = (ev) => {
        this.handleIncomingEnvelope(ev.data);
      };
    } catch {
      // BroadcastChannel not supported
    }

    // ---------------------------------------------------------
    // B. Local Wi-Fi / LAN Relay (Vite Server Middleware)
    // ---------------------------------------------------------
    try {
      const sseUrl = `/__duel_relay?room=${encodeURIComponent(this.roomCode)}`;
      this.sse = new EventSource(sseUrl);

      this.sse.onopen = () => {
        this.lanAvailable = true;
        markConnected();
      };

      this.sse.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed.type === 'CONNECTED') {
            this.lanAvailable = true;
            markConnected();
            return;
          }
          this.handleIncomingEnvelope(parsed);
        } catch {
          // Ignore malformed JSON
        }
      };

      this.sse.onerror = () => {
        // On static Vercel hosting, /__duel_relay doesn't exist; close SSE and rely on PeerJS
        if (!this.lanAvailable && this.sse) {
          this.sse.close();
          this.sse = null;
        }
      };
    } catch {
      // Ignore SSE errors
    }

    // ---------------------------------------------------------
    // C. PeerJS WebRTC (Works across Wi-Fi devices AND Vercel!)
    // ---------------------------------------------------------
    try {
      const hostPeerId = `sudoku-duel-room-${this.roomCode}`;
      this.peer = isHost ? new Peer(hostPeerId) : new Peer();

      this.peer.on('open', () => {
        markConnected();

        if (!isHost && this.peer) {
          // Guest connects to Host's deterministic Peer ID
          const conn = this.peer.connect(hostPeerId, { reliable: true });
          this.setupPeerConnection(conn, markConnected);
        }
      });

      this.peer.on('connection', (conn) => {
        this.setupPeerConnection(conn, markConnected);
      });

      this.peer.on('error', () => {
        // Even if PeerJS has an issue, LAN SSE or BroadcastChannel may be active
        markConnected();
      });
    } catch {
      markConnected();
    }
  }

  private setupPeerConnection(conn: DataConnection, onOpenCallback: () => void) {
    conn.on('open', () => {
      this.connections.push(conn);
      onOpenCallback();
    });

    conn.on('data', (data) => {
      this.handleIncomingEnvelope(data);
    });

    conn.on('close', () => {
      this.connections = this.connections.filter(c => c !== conn);
    });
  }

  send(event: MultiplayerEvent): void {
    const envelope: WrappedEnvelope = {
      _msgId: `${this.playerId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      _senderId: this.playerId,
      event,
    };

    // 1. Send via BroadcastChannel
    if (this.bc) {
      try {
        this.bc.postMessage(envelope);
      } catch {
        // Ignore
      }
    }

    // 2. Send via Vite Wi-Fi LAN Relay
    if (this.lanAvailable) {
      fetch(`/__duel_relay?room=${encodeURIComponent(this.roomCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      }).catch(() => {
        // Ignore fetch errors
      });
    }

    // 3. Send via PeerJS WebRTC DataConnections
    this.connections.forEach(conn => {
      if (conn.open) {
        try {
          conn.send(envelope);
        } catch {
          // Ignore
        }
      }
    });
  }

  disconnect(): void {
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    this.connections.forEach(c => c.close());
    this.connections = [];
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}

// Factory to create the best available provider
export function createRealtimeService(): RealtimeAdapter {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
    return new SupabaseRealtimeProvider(supabaseUrl, supabaseAnonKey);
  }

  // Hybrid provider works across Wi-Fi devices, Vercel (WebRTC), and local tabs!
  return new HybridRealtimeProvider();
}
