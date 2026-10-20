import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthoritativeRoomState, MultiplayerEvent, RoomPlayer } from '../types/multiplayer';
import { PowerId } from '../types/game';
import { createRealtimeService, RealtimeAdapter } from '../services/realtime';
import { MatchAuthority } from '../services/matchAuthority';
import { soundManager } from '../utils/sound';
import { fireBlockBonusConfetti, fireVictoryConfetti } from '../utils/confetti';
import { createInitialPowerState, DEFAULT_SELECTED_POWERS, POWER_DEFINITIONS } from '../utils/powers';

interface UseMultiplayerMatchProps {
  roomCode: string | null;
  playerProfile: { id: string; nickname: string; selectedPowers?: PowerId[] } | null;
  isHost: boolean;
  onExitLobby: () => void;
  onNotification?: (text: string, type: 'correct' | 'wrong' | 'bonus' | 'timeout' | 'rush', color?: string) => void;
  onIceStruckByOpponent?: (cellId: string | null) => void;
}

export function useMultiplayerMatch({
  roomCode,
  playerProfile,
  isHost,
  onExitLobby,
  onNotification,
  onIceStruckByOpponent,
}: UseMultiplayerMatchProps) {
  const [roomState, setRoomState] = useState<AuthoritativeRoomState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [matchTimeRemaining, setMatchTimeRemaining] = useState<number>(480);
  const [localFeedback, setLocalFeedback] = useState<{ cellId: string; text: string; type: 'correct' | 'wrong' | 'stolen' } | null>(null);
  const [mpDetectiveHint, setMpDetectiveHint] = useState<{ cellId: string; candidates: number[] } | null>(null);

  const realtimeRef = useRef<RealtimeAdapter | null>(null);
  const authorityRef = useRef<MatchAuthority | null>(null);
  const roomStateRef = useRef<AuthoritativeRoomState | null>(null);
  roomStateRef.current = roomState;

  const onExitLobbyRef = useRef(onExitLobby);
  onExitLobbyRef.current = onExitLobby;
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;
  const onIceStruckByOpponentRef = useRef(onIceStruckByOpponent);
  onIceStruckByOpponentRef.current = onIceStruckByOpponent;

  // Sound and confetti handler for authoritative events
  const handleGameEvent = useCallback((event: MultiplayerEvent) => {
    switch (event.type) {
      case 'SYNC_STATE':
        setRoomState(event.state);
        if (event.state.status === 'playing' && event.state.matchEndTime) {
          const rem = Math.max(0, Math.ceil((event.state.matchEndTime - Date.now()) / 1000));
          setMatchTimeRemaining(rem);
        }
        break;

      case 'COUNTDOWN_TICK':
        setCountdown(event.count);
        soundManager.playTap();
        break;

      case 'START_MATCH':
        setCountdown(0);
        setTimeout(() => setCountdown(null), 800);
        soundManager.playFinalRush();
        break;

      case 'SELECT_CELL':
        setRoomState(prev => {
          if (!prev) return null;
          const updatedPlayers = { ...prev.players };
          if (updatedPlayers[event.playerId]) {
            updatedPlayers[event.playerId] = {
              ...updatedPlayers[event.playerId],
              activeCellId: event.cellId,
              cellSelectedAt: event.timestamp,
            };
          }
          return { ...prev, players: updatedPlayers };
        });
        break;

      case 'MOVE_RESULT': {
        const isMyMove = event.playerId === playerProfile?.id;
        const wasStolenFromMe = event.stolenFromPlayerId === playerProfile?.id;

        if (event.isCorrect) {
          if (isMyMove) {
            soundManager.playCorrect(event.newCombo);
            const burstBadge = event.speedBurstApplied ? ' ⚡x1.5' : ' 🔥';
            setLocalFeedback({ cellId: event.cellId, text: `+${event.scoreChange}${burstBadge}`, type: 'correct' });
            setMpDetectiveHint(null);
          } else {
            soundManager.playOpponentMove();
            setLocalFeedback({ cellId: event.cellId, text: `+${event.scoreChange} ⚔️`, type: 'wrong' });
          }

          if (wasStolenFromMe) {
            soundManager.playStolen();
            setLocalFeedback({ cellId: event.cellId, text: 'KAPTIRILDI! ⚡', type: 'stolen' });
            setMpDetectiveHint(null);
          }

          if (event.blockBonusAwarded && event.blockBonusAwarded > 0) {
            if (isMyMove) {
              soundManager.playBlockBonus();
              fireBlockBonusConfetti();
              onNotificationRef.current?.(
                `👑 3x3 BÖLGE FETHEDİLDİ! +${event.blockBonusAwarded} PUAN`,
                'bonus',
                '#38bdf8'
              );
            } else {
              onNotificationRef.current?.(
                `⚔️ RAKİP BÖLGE FETHETTİ! +${event.blockBonusAwarded} PUAN`,
                'bonus',
                '#f43f5e'
              );
            }
          }
        } else {
          if (isMyMove) {
            if (event.shieldTriggered === 'error_shield') {
              soundManager.playShieldDeflect();
              setLocalFeedback({ cellId: event.cellId, text: '🛡️ KALKAN KORUDU!', type: 'correct' });
              onNotificationRef.current?.(
                '🛡️ HATA KALKANI! -5 Ceza ve Combo Sıfırlama Engellendi!',
                'bonus',
                '#38bdf8'
              );
            } else if (event.shieldTriggered === 'combo_saver') {
              soundManager.playShieldDeflect();
              setLocalFeedback({ cellId: event.cellId, text: `${event.scoreChange} 🔥x${event.newCombo}`, type: 'wrong' });
              onNotificationRef.current?.(
                `🔥 COMBO KURTARICI! Combo x${event.newCombo} seviyesinde korundu!`,
                'bonus',
                '#10b981'
              );
            } else {
              soundManager.playWrong();
              setLocalFeedback({ cellId: event.cellId, text: `${event.scoreChange} ❌`, type: 'wrong' });
            }
            setMpDetectiveHint(null);
          }
        }

        setTimeout(() => setLocalFeedback(null), 1200);
        break;
      }

      case 'POWER_RESULT': {
        const isMyPower = event.playerId === playerProfile?.id;
        const isTargetedAtMe = event.targetPlayerId === playerProfile?.id;

        if (!event.success) {
          if (isMyPower && event.reason) {
            onNotificationRef.current?.(event.reason, 'timeout', '#f59e0b');
          }
          break;
        }

        const def = POWER_DEFINITIONS[event.powerId];

        if (isMyPower) {
          soundManager.playPowerActivate(event.powerId);

          if (event.powerId === 'detective' && event.candidates && event.targetCellId) {
            setMpDetectiveHint({
              cellId: event.targetCellId,
              candidates: event.candidates,
            });
            onNotificationRef.current?.(
              `🔍 DEDEKTİF: Adaylar [${event.candidates.join(', ')}]`,
              'correct',
              '#a855f7'
            );
          } else if (event.powerId === 'ice_strike') {
            onNotificationRef.current?.(
              '❄️ BUZ DARBESİ! Rakip 5 saniye boyunca tahtayı göremiyor!',
              'correct',
              '#06b6d4'
            );
          } else if (event.powerId === 'board_scramble') {
            onNotificationRef.current?.(
              '🌀 TAHTA KARIŞTIRICI! Rakibin tahtası 5 saniye boyunca karışıyor!',
              'correct',
              '#ec4899'
            );
          } else if (def) {
            onNotificationRef.current?.(
              `✨ ${def.name.toUpperCase()} AKTİF!`,
              'bonus',
              def.color
            );
          }
        } else if (isTargetedAtMe && event.powerId === 'ice_strike') {
          soundManager.playIceStrike();
          onIceStruckByOpponentRef.current?.(null);
          onNotificationRef.current?.(
            '❄️ BUZ DARBESİ! Tahtan 5 saniye boyunca buzlandı!',
            'timeout',
            '#06b6d4'
          );
        } else if (isTargetedAtMe && event.powerId === 'board_scramble') {
          soundManager.playBoardScramble();
          onNotificationRef.current?.(
            '🌀 TAHTA KARIŞTIRICI! Rakip tahtanı 5 saniyeliğine karıştırdı!',
            'timeout',
            '#ec4899'
          );
        }
        break;
      }

      case 'PLAYER_LEFT':
        setConnectionStatus('disconnected');
        break;
    }
  }, [playerProfile?.id]);

  // Connect to Realtime channel
  useEffect(() => {
    if (!roomCode || !playerProfile) {
      setRoomState(null);
      return;
    }

    const realtime = createRealtimeService();
    realtimeRef.current = realtime;

    // If host, instantiate MatchAuthority
    if (isHost) {
      authorityRef.current = new MatchAuthority(
        roomCode,
        playerProfile,
        (ev) => {
          realtime.send(ev);
          handleGameEvent(ev);
        }
      );
      setRoomState(authorityRef.current.getState());
    } else {
      setRoomState(null);
    }

    let joinRetryInterval: number | null = null;

    realtime.connect(
      roomCode,
      playerProfile.id,
      isHost,
      (ev) => {
        if (isHost && authorityRef.current) {
          if (ev.type === 'JOIN_ROOM') {
            authorityRef.current.handlePlayerJoin(ev.player);
          } else if (ev.type === 'SELECT_CELL') {
            authorityRef.current.handleSelectCell(ev.playerId, ev.cellId, ev.timestamp);
          } else if (ev.type === 'SUBMIT_MOVE') {
            authorityRef.current.handleSubmitMove(ev.playerId, ev.cellId, ev.chosenNumber, ev.timestamp);
          } else if (ev.type === 'USE_POWER') {
            authorityRef.current.handleUsePower(ev.playerId, ev.powerId, ev.targetCellId, ev.timestamp);
          } else if (ev.type === 'REQUEST_REMATCH') {
            authorityRef.current.handleRematch();
          }
        }

        handleGameEvent(ev);
      },
      (status) => {
        setConnectionStatus(status);
        if (status === 'connected' && !isHost) {
          const sendJoin = () => {
            realtime.send({
              type: 'JOIN_ROOM',
              roomCode,
              player: {
                id: playerProfile.id,
                nickname: playerProfile.nickname,
                selectedPowers: playerProfile.selectedPowers,
              },
            });
          };

          // Send immediately and retry every 1s until Host replies with SYNC_STATE
          sendJoin();
          if (joinRetryInterval) clearInterval(joinRetryInterval);
          joinRetryInterval = window.setInterval(() => {
            if (!roomStateRef.current) {
              sendJoin();
            } else if (joinRetryInterval) {
              clearInterval(joinRetryInterval);
              joinRetryInterval = null;
            }
          }, 1000);
        }
      }
    );

    return () => {
      if (joinRetryInterval) clearInterval(joinRetryInterval);
      realtime.disconnect();
      authorityRef.current?.destroy();
      realtimeRef.current = null;
      authorityRef.current = null;
    };
  }, [roomCode, playerProfile, isHost, handleGameEvent]);

  // Synchronized Match Timer (Server/Timestamp Authoritative)
  const lastBeepSecRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomState || roomState.status !== 'playing' || !roomState.matchEndTime) {
      lastBeepSecRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remainingMs = Math.max(0, (roomState.matchEndTime || 0) - now);
      const remainingSec = Math.ceil(remainingMs / 1000);
      setMatchTimeRemaining(remainingSec);

      if (remainingSec !== lastBeepSecRef.current) {
        lastBeepSecRef.current = remainingSec;
        if (remainingSec === 60) {
          soundManager.playFinalRush();
          onNotificationRef.current?.('⏳ SON 60 SANİYE!', 'rush', '#f59e0b');
        } else if (remainingSec <= 10 && remainingSec >= 1) {
          soundManager.playMatchCountdownBeep(remainingSec);
        }
      }

      if (remainingSec <= 0) {
        clearInterval(interval);
        if (isHost && authorityRef.current) {
          authorityRef.current.finishMatch();
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [roomState?.status, roomState?.matchEndTime, isHost]);

  // When match finishes, play game over sound
  const finishedHandledRef = useRef(false);
  useEffect(() => {
    if (roomState?.status === 'finished' && !finishedHandledRef.current) {
      finishedHandledRef.current = true;
      setMpDetectiveHint(null);
      const isWinner = roomState.winnerId === playerProfile?.id;
      soundManager.playGameOver(isWinner);
      if (isWinner) {
        fireVictoryConfetti();
      }
    } else if (roomState?.status === 'playing') {
      finishedHandledRef.current = false;
    }
  }, [roomState?.status, roomState?.winnerId, playerProfile?.id]);

  // Actions
  const selectCell = useCallback((cellId: string | null) => {
    if (!playerProfile || !realtimeRef.current) return;
    setMpDetectiveHint(null);
    const now = Date.now();

    if (isHost && authorityRef.current) {
      authorityRef.current.handleSelectCell(playerProfile.id, cellId, now);
    } else {
      realtimeRef.current.send({
        type: 'SELECT_CELL',
        playerId: playerProfile.id,
        cellId,
        timestamp: now,
      });
    }
  }, [playerProfile, isHost]);

  const submitMove = useCallback((cellId: string, chosenNumber: number) => {
    if (!playerProfile || !realtimeRef.current) return;
    setMpDetectiveHint(null);
    const now = Date.now();

    if (isHost && authorityRef.current) {
      authorityRef.current.handleSubmitMove(playerProfile.id, cellId, chosenNumber, now);
    } else {
      realtimeRef.current.send({
        type: 'SUBMIT_MOVE',
        playerId: playerProfile.id,
        cellId,
        chosenNumber,
        timestamp: now,
      });
    }
  }, [playerProfile, isHost]);

  const usePower = useCallback((powerId: PowerId, targetCellId?: string | null) => {
    if (!playerProfile || !realtimeRef.current) return;
    const now = Date.now();

    if (isHost && authorityRef.current) {
      authorityRef.current.handleUsePower(playerProfile.id, powerId, targetCellId, now);
    } else {
      realtimeRef.current.send({
        type: 'USE_POWER',
        playerId: playerProfile.id,
        powerId,
        targetCellId,
        timestamp: now,
      });
    }
  }, [playerProfile, isHost]);

  const requestRematch = useCallback(() => {
    if (!playerProfile || !realtimeRef.current) return;
    setMpDetectiveHint(null);

    if (isHost && authorityRef.current) {
      authorityRef.current.handleRematch();
    } else {
      realtimeRef.current.send({
        type: 'REQUEST_REMATCH',
        playerId: playerProfile.id,
      });
    }
  }, [playerProfile, isHost]);

  // Mapping state for local player vs opponent
  const myPlayer: RoomPlayer = (playerProfile && roomState?.players[playerProfile.id]) || {
    id: playerProfile?.id || '',
    nickname: playerProfile?.nickname || 'Sen',
    isHost: Boolean(isHost),
    score: 0,
    combo: 0,
    maxCombo: 0,
    cellsClaimed: 0,
    blocksWon: 0,
    powers: createInitialPowerState(playerProfile?.selectedPowers || DEFAULT_SELECTED_POWERS),
    connected: true,
    lastSeen: Date.now(),
  };

  const opponentId = roomState?.playerOrder.find(id => id !== playerProfile?.id);
  const opponentPlayer: RoomPlayer | null = (opponentId && roomState?.players[opponentId]) || null;

  return {
    roomState,
    connectionStatus,
    countdown,
    matchTimeRemaining,
    localFeedback,
    mpDetectiveHint,
    myPlayer,
    opponentPlayer,
    selectCell,
    submitMove,
    usePower,
    requestRematch,
  };
}
