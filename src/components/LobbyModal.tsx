import React, { useState, useEffect } from 'react';
import { Users, Bot, Copy, Check, ArrowRight, Wifi } from 'lucide-react';

interface LobbyModalProps {
  onStartAIMode: () => void;
  onHostRoom: (nickname: string, roomCode: string) => void;
  onJoinRoom: (nickname: string, roomCode: string) => void;
  isOnlineConfigured: boolean;
  waitingRoomCode?: string | null;
  isJoiningRoom?: boolean;
  onCancelWait?: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  onStartAIMode,
  onHostRoom,
  onJoinRoom,
  isOnlineConfigured,
  waitingRoomCode,
  isJoiningRoom = false,
  onCancelWait,
}) => {
  const [nickname, setNickname] = useState<string>(() => {
    return localStorage.getItem('duel_nickname') || `Oyuncu_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [mode, setMode] = useState<'main' | 'multiplayer' | 'join'>('main');
  const [joinCode, setJoinCode] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('duel_nickname', nickname);
  }, [nickname]);

  // Check if URL has ?room=ABC123 query param for 1-click invite link!
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinCode(roomParam.toUpperCase());
      setMode('join');
    }
  }, []);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateRoom = () => {
    if (!nickname.trim()) {
      setErrorMsg('Lütfen bir isim girin!');
      return;
    }
    setErrorMsg('');
    const code = generateRoomCode();
    onHostRoom(nickname.trim(), code);
  };

  const handleJoinRoom = () => {
    if (!nickname.trim()) {
      setErrorMsg('Lütfen bir isim girin!');
      return;
    }
    if (!joinCode.trim()) {
      setErrorMsg('Lütfen oda kodunu girin!');
      return;
    }
    setErrorMsg('');
    onJoinRoom(nickname.trim(), joinCode.trim().toUpperCase());
  };

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Waiting or Connecting Room View
  if (waitingRoomCode) {
    return (
      <div className="lobby-overlay">
        <div className="lobby-modal animate-scale-in">
          <div className="lobby-header">
            <span className="lobby-tag">
              {isJoiningRoom ? 'BAĞLANTI KURULUYOR' : 'ODA OLUŞTURULDU'}
            </span>
            <h2 className="lobby-title">
              {isJoiningRoom ? 'Odaya Katılınıyor...' : 'Rakip Bekleniyor...'}
            </h2>
            <p className="lobby-subtitle">
              {isJoiningRoom
                ? `${waitingRoomCode} kodlu odaya bağlanılıyor, lütfen bekleyin...`
                : 'Bu kodu arkadaşına gönder, aynı odaya katılsın!'}
            </p>
          </div>

          <div className="room-code-card">
            <span className="room-code-label">ODA KODU</span>
            <span className="room-code-val">{waitingRoomCode}</span>
            {!isJoiningRoom && (
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopyCode(waitingRoomCode)}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Kopyalandı!' : 'Kodu Kopyala'}</span>
              </button>
            )}
          </div>

          <div className="waiting-spinner-row">
            <div className="radar-spinner" />
            <span>
              {isJoiningRoom
                ? 'Ev sahibi (Host) cihazdan oyun tahtası alınıyor...'
                : 'İkinci oyuncu bağlandığında maç otomatik başlayacak...'}
            </span>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={onCancelWait}
          >
            İptal Et ve Geri Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-overlay">
      <div className="lobby-modal animate-scale-in">
        {/* Title */}
        <div className="lobby-header">
          <div className="game-logo-badge">⚔️ SUDOKU DUEL</div>
          <h1 className="lobby-title">Hızlı Sudoku Arenası</h1>
          <p className="lobby-subtitle">
            Match Masters tarzı gerçek zamanlı rekabetçi Sudoku düellosu
          </p>
        </div>

        {/* Nickname input */}
        <div className="input-group">
          <label className="input-label" htmlFor="nickname-input">
            OYUNCU ADI
          </label>
          <input
            id="nickname-input"
            type="text"
            className="lobby-input"
            value={nickname}
            maxLength={14}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Adınızı girin..."
          />
        </div>

        {errorMsg && <div className="error-alert">{errorMsg}</div>}

        {/* Main Mode Selection */}
        {mode === 'main' && (
          <div className="mode-options-grid">
            <button
              type="button"
              className="mode-card card-ai"
              onClick={onStartAIMode}
            >
              <div className="mode-icon-circle ai-icon-circle">
                <Bot size={26} />
              </div>
              <div className="mode-info">
                <span className="mode-title">AI İLE OYNA</span>
                <span className="mode-desc">Orta seviye akıllı bota karşı anında pratik yap</span>
              </div>
              <ArrowRight size={18} className="arrow-icon" />
            </button>

            <button
              type="button"
              className="mode-card card-pvp"
              onClick={() => setMode('multiplayer')}
            >
              <div className="mode-icon-circle pvp-icon-circle">
                <Users size={26} />
              </div>
              <div className="mode-info">
                <span className="mode-title">ARKADAŞINLA OYNA</span>
                <span className="mode-desc">Aynı Sudoku tahtasında gerçek zamanlı 1v1 yarış</span>
              </div>
              <ArrowRight size={18} className="arrow-icon" />
            </button>
          </div>
        )}

        {/* Multiplayer Submenu */}
        {mode === 'multiplayer' && (
          <div className="multiplayer-actions">
            <button
              type="button"
              className="primary-action-btn"
              onClick={handleCreateRoom}
            >
              <Users size={18} />
              <span>YENİ ODA OLUŞTUR</span>
            </button>

            <button
              type="button"
              className="secondary-action-btn"
              onClick={() => setMode('join')}
            >
              <span>ODAYA KATIL</span>
            </button>

            <button
              type="button"
              className="text-back-btn"
              onClick={() => setMode('main')}
            >
              ← Ana Menüye Dön
            </button>
          </div>
        )}

        {/* Join Room Input View */}
        {mode === 'join' && (
          <div className="join-room-view">
            <div className="input-group">
              <label className="input-label" htmlFor="code-input">
                ODA KODU
              </label>
              <input
                id="code-input"
                type="text"
                className="lobby-input uppercase-input"
                value={joinCode}
                maxLength={8}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Örn: ABC123"
                autoFocus
              />
            </div>

            <button
              type="button"
              className="primary-action-btn"
              onClick={handleJoinRoom}
            >
              <span>ODAYA KATIL</span>
            </button>

            <button
              type="button"
              className="text-back-btn"
              onClick={() => setMode('multiplayer')}
            >
              ← Geri
            </button>
          </div>
        )}

        {/* Realtime Engine Status Indicator */}
        <div className="realtime-status-footer">
          {isOnlineConfigured ? (
            <span className="status-badge status-online">
              <Wifi size={13} /> Supabase Cloud Realtime Aktif
            </span>
          ) : (
            <span className="status-badge status-online">
              <Wifi size={13} /> Wi-Fi & WebRTC Çoklu-Cihaz Ağı Aktif
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
