import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CellData,
  GameStatus,
  PlayerStats,
  FloatingNotification,
  PowerId,
  PlayerPowerState,
} from './types/game';
import {
  generateDuelBoard,
  calculateMoveScore,
  isMoveCorrect,
  getValidSudokuCandidates,
} from './utils/sudoku';
import {
  DEFAULT_SELECTED_POWERS,
  POWER_DEFINITIONS,
  createInitialPowerState,
  pickAIPowers,
  getRemainingCooldownSeconds,
  isPowerBuffCurrentlyActive,
  startPowerCooldown,
  applyEnergyOnCorrectMove,
  applyPassiveEnergyTick,
} from './utils/powers';
import { soundManager } from './utils/sound';
import { fireVictoryConfetti, fireBlockBonusConfetti } from './utils/confetti';
import { useAIOpponent } from './hooks/useAIOpponent';
import { useMultiplayerMatch } from './hooks/useMultiplayerMatch';
import { Header } from './components/Header';
import { TurnTimerBar } from './components/TurnTimerBar';
import { Board } from './components/Board';
import { NumberPad } from './components/NumberPad';
import { PowerBar } from './components/PowerBar';
import { PowerSelectModal } from './components/PowerSelectModal';
import { GameOverModal } from './components/GameOverModal';
import { FloatingNotificationView } from './components/FloatingNotification';
import { LobbyModal } from './components/LobbyModal';
import { CountdownOverlay } from './components/CountdownOverlay';
import './App.css';

const MATCH_DURATION = 480; // 480 seconds (8 minutes) total match
const TURN_DURATION = 5.0; // 5 seconds per move

type PendingStartAction =
  | { mode: 'ai' }
  | { mode: 'host'; nickname: string; code: string }
  | { mode: 'join'; nickname: string; code: string }
  | null;

export const App: React.FC = () => {
  // App navigation state: 'lobby' | 'power_select' | 'ai' | 'multiplayer'
  const [appMode, setAppMode] = useState<'lobby' | 'power_select' | 'ai' | 'multiplayer'>(() => {
    const savedRoom = sessionStorage.getItem('duel_active_room');
    return savedRoom ? 'multiplayer' : 'lobby';
  });

  // Player's chosen 3 powers (persisted in localStorage for convenience)
  const [selectedPowers, setSelectedPowers] = useState<PowerId[]>(() => {
    try {
      const saved = localStorage.getItem('duel_selected_powers');
      if (saved) {
        const parsed = JSON.parse(saved) as PowerId[];
        if (Array.isArray(parsed) && parsed.length === 3) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SELECTED_POWERS;
  });

  const handleUpdateSelectedPowers = (powers: PowerId[]) => {
    setSelectedPowers(powers);
    if (powers.length === 3) {
      localStorage.setItem('duel_selected_powers', JSON.stringify(powers));
    }
  };

  const [pendingAction, setPendingAction] = useState<PendingStartAction>(null);

  const [multiplayerConfig, setMultiplayerConfig] = useState<{
    roomCode: string | null;
    isHost: boolean;
    playerProfile: { id: string; nickname: string; selectedPowers?: PowerId[] } | null;
  }>(() => {
    const savedRoom = sessionStorage.getItem('duel_active_room');
    const savedProfile = sessionStorage.getItem('duel_player_profile');
    const savedIsHost = sessionStorage.getItem('duel_is_host') === 'true';

    if (savedRoom && savedProfile) {
      return {
        roomCode: savedRoom,
        isHost: savedIsHost,
        playerProfile: JSON.parse(savedProfile),
      };
    }
    return { roomCode: null, isHost: false, playerProfile: null };
  });

  // Sound settings
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // ---------------------------------------------------------------------------
  // SINGLE PLAYER (AI MODE) STATE
  // ---------------------------------------------------------------------------
  const [aiGameStatus, setAiGameStatus] = useState<GameStatus>('playing');
  const [aiMatchTimeRemaining, setAiMatchTimeRemaining] = useState<number>(MATCH_DURATION);
  const [aiCells, setAiCells] = useState<CellData[]>(() => generateDuelBoard());
  const [aiSelectedCellId, setAiSelectedCellId] = useState<string | null>(null);
  const [aiTurnTimeRemaining, setAiTurnTimeRemaining] = useState<number | null>(null);
  const [aiConqueredBlocks, setAiConqueredBlocks] = useState<Record<number, 'player' | 'ai'>>({});
  const [aiThinking, setAiThinking] = useState<boolean>(false);
  const [aiTargetCellId, setAiTargetCellId] = useState<string | null>(null);

  // Power states for AI mode
  const [playerPowerState, setPlayerPowerState] = useState<PlayerPowerState>(() =>
    createInitialPowerState(selectedPowers)
  );
  const playerPowerStateRef = useRef(playerPowerState);
  playerPowerStateRef.current = playerPowerState;

  const [aiPowerState, setAiPowerState] = useState<PlayerPowerState>(() =>
    createInitialPowerState(pickAIPowers())
  );
  const aiPowerStateRef = useRef(aiPowerState);
  aiPowerStateRef.current = aiPowerState;

  // Detective hint for currently selected cell in AI mode
  const [aiDetectiveHint, setAiDetectiveHint] = useState<{
    cellId: string;
    candidates: number[];
  } | null>(null);

  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    cellsClaimed: 0,
    blocksWon: 0,
  });

  const [aiStats, setAiStats] = useState<PlayerStats>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    cellsClaimed: 0,
    blocksWon: 0,
  });

  const [notifications, setNotifications] = useState<FloatingNotification[]>([]);

  // Helper to add floating notifications
  const addNotification = useCallback(
    (
      text: string,
      type: 'correct' | 'wrong' | 'bonus' | 'timeout' | 'rush',
      color = '#ffffff'
    ) => {
      const id = `${Date.now()}-${Math.random()}`;
      setNotifications(prev => [...prev.slice(-2), { id, text, type, color }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 1900);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // MULTIPLAYER MATCH HOOK
  // ---------------------------------------------------------------------------
  const [mpSelectedCellId, setMpSelectedCellId] = useState<string | null>(null);
  const [mpTurnTimeRemaining, setMpTurnTimeRemaining] = useState<number | null>(null);

  const handleMpIceStruckByOpponent = useCallback(() => {
    setMpSelectedCellId(null);
    setMpTurnTimeRemaining(null);
  }, []);

  const {
    roomState,
    countdown,
    matchTimeRemaining: mpMatchTimeRemaining,
    localFeedback: mpFeedback,
    mpDetectiveHint,
    myPlayer: mpMyPlayer,
    opponentPlayer: mpOpponent,
    selectCell: mpSelectCell,
    submitMove: mpSubmitMove,
    usePower: mpUsePower,
    requestRematch: mpRequestRematch,
  } = useMultiplayerMatch({
    roomCode: appMode === 'multiplayer' ? multiplayerConfig.roomCode : null,
    playerProfile: appMode === 'multiplayer' ? multiplayerConfig.playerProfile : null,
    isHost: multiplayerConfig.isHost,
    onExitLobby: () => handleReturnToLobby(),
    onNotification: addNotification,
    onIceStruckByOpponent: handleMpIceStruckByOpponent,
  });

  // Sound toggle handler
  const handleToggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    soundManager.enabled = newState;
  };

  // ---------------------------------------------------------------------------
  // LOBBY & PRE-MATCH POWER SELECTION FLOW
  // ---------------------------------------------------------------------------
  const launchAIMatchWithPowers = (chosenPowers: PowerId[]) => {
    const validPowers = chosenPowers.length === 3 ? chosenPowers : DEFAULT_SELECTED_POWERS;
    setAiCells(generateDuelBoard());
    setAiGameStatus('playing');
    setAiMatchTimeRemaining(MATCH_DURATION);
    setAiSelectedCellId(null);
    setAiTurnTimeRemaining(null);
    setAiDetectiveHint(null);
    setAiConqueredBlocks({});
    setPlayerPowerState(createInitialPowerState(validPowers));
    setAiPowerState(createInitialPowerState(pickAIPowers()));
    setPlayerStats({ score: 0, combo: 0, maxCombo: 0, cellsClaimed: 0, blocksWon: 0 });
    setAiStats({ score: 0, combo: 0, maxCombo: 0, cellsClaimed: 0, blocksWon: 0 });
    setAppMode('ai');
  };

  const handleRequestStartAIMode = () => {
    setPendingAction({ mode: 'ai' });
    setAppMode('power_select');
  };

  const handleRequestHostRoom = (nickname: string, code: string) => {
    setPendingAction({ mode: 'host', nickname, code });
    setAppMode('power_select');
  };

  const handleRequestJoinRoom = (nickname: string, code: string) => {
    setPendingAction({ mode: 'join', nickname, code });
    setAppMode('power_select');
  };

  const handleConfirmPowerSelection = () => {
    const finalPowers = selectedPowers.length === 3 ? selectedPowers : DEFAULT_SELECTED_POWERS;
    localStorage.setItem('duel_selected_powers', JSON.stringify(finalPowers));

    if (!pendingAction || pendingAction.mode === 'ai') {
      launchAIMatchWithPowers(finalPowers);
      setPendingAction(null);
      return;
    }

    if (pendingAction.mode === 'host') {
      const profile = {
        id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        nickname: pendingAction.nickname,
        selectedPowers: finalPowers,
      };
      sessionStorage.setItem('duel_active_room', pendingAction.code);
      sessionStorage.setItem('duel_player_profile', JSON.stringify(profile));
      sessionStorage.setItem('duel_is_host', 'true');

      setMultiplayerConfig({
        roomCode: pendingAction.code,
        isHost: true,
        playerProfile: profile,
      });
      setPendingAction(null);
      setAppMode('multiplayer');
      return;
    }

    if (pendingAction.mode === 'join') {
      const profile = {
        id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        nickname: pendingAction.nickname,
        selectedPowers: finalPowers,
      };
      sessionStorage.setItem('duel_active_room', pendingAction.code);
      sessionStorage.setItem('duel_player_profile', JSON.stringify(profile));
      sessionStorage.setItem('duel_is_host', 'false');

      setMultiplayerConfig({
        roomCode: pendingAction.code,
        isHost: false,
        playerProfile: profile,
      });
      setPendingAction(null);
      setAppMode('multiplayer');
    }
  };

  const handleReturnToLobby = () => {
    sessionStorage.removeItem('duel_active_room');
    sessionStorage.removeItem('duel_player_profile');
    sessionStorage.removeItem('duel_is_host');

    setMultiplayerConfig({ roomCode: null, isHost: false, playerProfile: null });
    setMpSelectedCellId(null);
    setMpTurnTimeRemaining(null);
    setAiSelectedCellId(null);
    setAiTurnTimeRemaining(null);
    setAiDetectiveHint(null);
    setPendingAction(null);
    setAppMode('lobby');
  };

  // Check 3x3 Block Conquered Bonus for AI mode (+100 or +150 with Region Hunter)
  const checkBlockConquest = useCallback(
    (
      currentCells: CellData[],
      currentConquered: Record<number, 'player' | 'ai'>,
      who: 'player' | 'ai'
    ) => {
      const newConquered = { ...currentConquered };
      let blocksWonIncrement = 0;
      let totalBonusPoints = 0;

      let regionHunterAvailable =
        who === 'player'
          ? playerPowerStateRef.current.hasRegionHunter
          : aiPowerStateRef.current.hasRegionHunter;
      let regionHunterConsumed = false;

      for (let b = 0; b < 9; b++) {
        if (newConquered[b]) continue;

        const blockContestedCells = currentCells.filter(c => c.block === b && !c.initial);
        if (blockContestedCells.length === 0) continue;

        const allClaimedByWho = blockContestedCells.every(c => c.claimedBy === who);

        if (allClaimedByWho) {
          newConquered[b] = who;
          blocksWonIncrement++;

          const blockBonus = regionHunterAvailable ? 150 : 100;
          if (regionHunterAvailable) {
            regionHunterAvailable = false;
            regionHunterConsumed = true;
          }
          totalBonusPoints += blockBonus;

          if (who === 'player') {
            soundManager.playBlockBonus();
            fireBlockBonusConfetti();
            addNotification(
              `👑 3x3 BÖLGE FETHEDİLDİ! +${blockBonus} PUAN`,
              'bonus',
              '#38bdf8'
            );
          } else {
            addNotification(
              `🤖 BOT BÖLGEYİ FETHETTİ! +${blockBonus} PUAN`,
              'bonus',
              '#f43f5e'
            );
          }
        }
      }

      if (blocksWonIncrement > 0) {
        setAiConqueredBlocks(newConquered);

        if (who === 'player') {
          if (regionHunterConsumed) {
            setPlayerPowerState(prev => ({ ...prev, hasRegionHunter: false }));
          }
          setPlayerStats(prev => ({
            ...prev,
            score: prev.score + totalBonusPoints,
            blocksWon: prev.blocksWon + blocksWonIncrement,
          }));
        } else {
          if (regionHunterConsumed) {
            setAiPowerState(prev => ({ ...prev, hasRegionHunter: false }));
          }
          setAiStats(prev => ({
            ...prev,
            score: prev.score + totalBonusPoints,
            blocksWon: prev.blocksWon + blocksWonIncrement,
          }));
        }
      }
    },
    [addNotification]
  );

  // Match Timer & Passive Power Energy Interval (AI mode)
  useEffect(() => {
    if (appMode !== 'ai' || aiGameStatus !== 'playing') return;

    const interval = setInterval(() => {
      const now = Date.now();
      setPlayerPowerState(prev => applyPassiveEnergyTick(prev, 1, now));
      setAiPowerState(prev => applyPassiveEnergyTick(prev, 1, now));

      setAiMatchTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setAiGameStatus('finished');
          return 0;
        }

        const nextSec = prev - 1;

        if (nextSec === 60) {
          soundManager.playFinalRush();
          addNotification('⏳ SON 60 SANİYE! TEMPOYU ARTIR!', 'rush', '#f59e0b');
        } else if (nextSec === 20) {
          soundManager.playFinalRush();
          addNotification('⚡ SON 20 SANİYE! HIZLAN! ⚡', 'rush', '#f59e0b');
        }

        if (nextSec <= 10 && nextSec >= 1) {
          soundManager.playMatchCountdownBeep(nextSec);
        }

        return nextSec;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [appMode, aiGameStatus, addNotification]);

  // AI Game finished sound & confetti
  const aiFinishedHandled = useRef(false);
  useEffect(() => {
    if (appMode === 'ai' && aiGameStatus === 'finished' && !aiFinishedHandled.current) {
      aiFinishedHandled.current = true;
      setAiSelectedCellId(null);
      setAiTurnTimeRemaining(null);
      setAiDetectiveHint(null);

      const isWinner = playerStats.score > aiStats.score;
      soundManager.playGameOver(isWinner);
      if (isWinner) {
        fireVictoryConfetti();
      }
    } else if (aiGameStatus === 'playing') {
      aiFinishedHandled.current = false;
    }
  }, [appMode, aiGameStatus, playerStats.score, aiStats.score]);

  // Turn Timer Interval (AI mode - 5.0s per move)
  useEffect(() => {
    if (appMode !== 'ai' || aiGameStatus !== 'playing' || aiSelectedCellId === null) {
      return;
    }

    const stepMs = 100;
    const interval = setInterval(() => {
      setAiTurnTimeRemaining(prev => {
        if (prev === null) return null;
        const nextTime = Math.max(0, prev - stepMs / 1000);

        if (nextTime <= 0) {
          clearInterval(interval);
          soundManager.playWrong();
          // Turn timeout: Combo resets, NO score penalty!
          addNotification('⏱️ SÜRE DOLDU! KOMBO SIFIRLANDI', 'timeout', '#f59e0b');
          setPlayerStats(p => ({ ...p, combo: 0 }));
          setAiSelectedCellId(null);
          setAiDetectiveHint(null);
          return null;
        }

        if (nextTime <= 2.0 && Math.round(nextTime * 10) % 5 === 0) {
          soundManager.playTick();
        }

        return nextTime;
      });
    }, stepMs);

    return () => clearInterval(interval);
  }, [appMode, aiGameStatus, aiSelectedCellId, addNotification]);

  // Turn Timer Interval (Multiplayer mode - 5.0s per move)
  useEffect(() => {
    if (appMode !== 'multiplayer' || roomState?.status !== 'playing' || mpSelectedCellId === null) {
      return;
    }

    const stepMs = 100;
    const interval = setInterval(() => {
      setMpTurnTimeRemaining(prev => {
        if (prev === null) return null;
        const nextTime = Math.max(0, prev - stepMs / 1000);

        if (nextTime <= 0) {
          clearInterval(interval);
          soundManager.playWrong();
          // Turn timeout: combo resets, no score penalty
          addNotification('⏱️ SÜRE DOLDU! KOMBO SIFIRLANDI', 'timeout', '#f59e0b');
          mpSelectCell(null);
          setMpSelectedCellId(null);
          return null;
        }

        if (nextTime <= 2.0 && Math.round(nextTime * 10) % 5 === 0) {
          soundManager.playTick();
        }

        return nextTime;
      });
    }, stepMs);

    return () => clearInterval(interval);
  }, [appMode, roomState?.status, mpSelectedCellId, mpSelectCell, addNotification]);

  // ---------------------------------------------------------------------------
  // POWER ACTIVATION HANDLERS (AI MODE & MULTIPLAYER MODE)
  // ---------------------------------------------------------------------------
  const handleAiUsePower = useCallback(
    (powerId: PowerId) => {
      if (aiGameStatus !== 'playing') return;

      const now = Date.now();
      const pState = playerPowerStateRef.current;

      if (!pState.selectedPowers.includes(powerId)) return;

      const cooldownRem = getRemainingCooldownSeconds(pState, powerId, now);
      if (cooldownRem > 0.1) {
        addNotification(
          `⏳ ${POWER_DEFINITIONS[powerId].name} bekleme süresinde (${Math.ceil(cooldownRem)}s)!`,
          'timeout',
          '#f59e0b'
        );
        return;
      }

      if (isPowerBuffCurrentlyActive(pState, powerId, now)) {
        addNotification('✨ Bu güç zaten aktif!', 'timeout', '#38bdf8');
        return;
      }

      switch (powerId) {
        case 'speed_burst': {
          soundManager.playPowerActivate('speed_burst');
          setPlayerPowerState(prev => ({
            ...startPowerCooldown(prev, 'speed_burst', now),
            speedBurstUntil: now + 6000,
          }));
          addNotification('⚡ HIZ PATLAMASI! 6sn +%50 Puan!', 'bonus', '#f59e0b');
          break;
        }

        case 'error_shield': {
          soundManager.playPowerActivate('error_shield');
          setPlayerPowerState(prev => ({
            ...startPowerCooldown(prev, 'error_shield', now),
            hasErrorShield: true,
          }));
          addNotification('🛡️ HATA KALKANI AKTİF!', 'bonus', '#38bdf8');
          break;
        }

        case 'combo_saver': {
          soundManager.playPowerActivate('combo_saver');
          setPlayerPowerState(prev => ({
            ...startPowerCooldown(prev, 'combo_saver', now),
            hasComboSaver: true,
          }));
          addNotification('🔥 COMBO KURTARICI AKTİF!', 'bonus', '#10b981');
          break;
        }

        case 'region_hunter': {
          soundManager.playPowerActivate('region_hunter');
          setPlayerPowerState(prev => ({
            ...startPowerCooldown(prev, 'region_hunter', now),
            hasRegionHunter: true,
          }));
          addNotification('👑 BÖLGE AVCISI! Sonraki 3x3 Bölge +150 Puan!', 'bonus', '#eab308');
          break;
        }

        case 'detective': {
          if (!aiSelectedCellId) {
            addNotification('🔍 Önce tahtadan boş bir hücre seçmelisin!', 'timeout', '#a855f7');
            return;
          }
          const cell = aiCells.find(c => c.id === aiSelectedCellId);
          if (!cell || cell.initial || cell.claimedBy !== null) {
            addNotification('🔍 Seçili hücre zaten dolu!', 'timeout', '#a855f7');
            return;
          }
          const candidates = getValidSudokuCandidates(aiCells, cell);
          if (candidates.length === 0) {
            addNotification('🔍 Bu hücre için geçerli aday bulunamadı!', 'timeout', '#a855f7');
            return;
          }

          soundManager.playPowerActivate('detective');
          setPlayerPowerState(prev => startPowerCooldown(prev, 'detective', now));
          setAiDetectiveHint({ cellId: cell.id, candidates });
          addNotification(
            `🔍 DEDEKTİF: Adaylar [${candidates.join(', ')}]`,
            'correct',
            '#a855f7'
          );
          break;
        }

        case 'ice_strike': {
          soundManager.playIceStrike();
          setPlayerPowerState(prev => startPowerCooldown(prev, 'ice_strike', now));
          setAiPowerState(prev => ({
            ...prev,
            blindedUntil: now + 5000,
          }));
          setAiTargetCellId(null);
          addNotification(
            '❄️ BUZ DARBESİ! Rakip 5 saniye boyunca tahtayı göremiyor!',
            'correct',
            '#06b6d4'
          );
          break;
        }

        case 'board_scramble': {
          soundManager.playBoardScramble();
          setPlayerPowerState(prev => startPowerCooldown(prev, 'board_scramble', now));
          setAiPowerState(prev => ({
            ...prev,
            scrambledUntil: now + 5000,
          }));
          addNotification(
            '🌀 TAHTA KARIŞTIRICI! Rakibin tahtası 5 saniye boyunca karışıyor!',
            'correct',
            '#ec4899'
          );
          break;
        }
      }
    },
    [aiGameStatus, aiSelectedCellId, aiCells, addNotification]
  );

  // AI Bot Power Activation Handler
  const handleAIUsePower = useCallback(
    (powerId: PowerId) => {
      if (aiGameStatus !== 'playing') return;
      const now = Date.now();
      const aiPState = aiPowerStateRef.current;

      if (!aiPState.selectedPowers.includes(powerId)) return;
      if (getRemainingCooldownSeconds(aiPState, powerId, now) > 0) return;

      switch (powerId) {
        case 'speed_burst':
          setAiPowerState(prev => ({
            ...startPowerCooldown(prev, 'speed_burst', now),
            speedBurstUntil: now + 6000,
          }));
          addNotification('🤖 Bot Hız Patlaması açtı!', 'rush', '#fb7185');
          break;

        case 'error_shield':
          setAiPowerState(prev => ({
            ...startPowerCooldown(prev, 'error_shield', now),
            hasErrorShield: true,
          }));
          break;

        case 'combo_saver':
          setAiPowerState(prev => ({
            ...startPowerCooldown(prev, 'combo_saver', now),
            hasComboSaver: true,
          }));
          break;

        case 'region_hunter':
          setAiPowerState(prev => ({
            ...startPowerCooldown(prev, 'region_hunter', now),
            hasRegionHunter: true,
          }));
          addNotification('🤖 Bot Bölge Avcısı (+150) açtı!', 'timeout', '#fb7185');
          break;

        case 'ice_strike':
          soundManager.playIceStrike();
          setAiPowerState(prev => startPowerCooldown(prev, 'ice_strike', now));
          setPlayerPowerState(prev => ({
            ...prev,
            blindedUntil: now + 5000,
          }));
          setAiSelectedCellId(null);
          setAiTurnTimeRemaining(null);
          setAiDetectiveHint(null);
          addNotification(
            '❄️ BUZ DARBESİ! Bot tahtanı 5 saniyeliğine dondurdu!',
            'timeout',
            '#06b6d4'
          );
          break;

        case 'board_scramble':
          soundManager.playBoardScramble();
          setAiPowerState(prev => startPowerCooldown(prev, 'board_scramble', now));
          setPlayerPowerState(prev => ({
            ...prev,
            scrambledUntil: now + 5000,
          }));
          addNotification(
            '🌀 TAHTA KARIŞTIRICI! Bot tahtanı 5 saniyeliğine karıştırdı!',
            'timeout',
            '#ec4899'
          );
          break;
      }
    },
    [aiGameStatus, addNotification]
  );

  // Multiplayer Power Activation Handler
  const handleMpUsePower = useCallback(
    (powerId: PowerId) => {
      if (roomState?.status !== 'playing') return;

      // Client-side quick feedback for Detective precondition before sending to authority
      if (powerId === 'detective' && !mpSelectedCellId) {
        addNotification('🔍 Önce tahtadan boş bir hücre seçmelisin!', 'timeout', '#a855f7');
        return;
      }

      mpUsePower(powerId, mpSelectedCellId);
    },
    [roomState?.status, mpSelectedCellId, mpUsePower, addNotification]
  );

  // ---------------------------------------------------------------------------
  // INPUT HANDLERS (AI MODE)
  // ---------------------------------------------------------------------------
  const handleAiSelectCell = (cell: CellData) => {
    if (aiGameStatus !== 'playing') return;
    if (
      playerPowerStateRef.current.blindedUntil &&
      Date.now() < playerPowerStateRef.current.blindedUntil
    ) {
      return;
    }
    if (cell.initial || cell.claimedBy !== null) return;

    if (aiSelectedCellId === cell.id) {
      setAiSelectedCellId(null);
      setAiTurnTimeRemaining(null);
      setAiDetectiveHint(null);
      return;
    }

    soundManager.playTap();
    setAiSelectedCellId(cell.id);
    setAiTurnTimeRemaining(TURN_DURATION);
    setAiDetectiveHint(null);
  };

  const handleAiDeselect = () => {
    setAiSelectedCellId(null);
    setAiTurnTimeRemaining(null);
    setAiDetectiveHint(null);
  };

  const handleAiNumberSelect = (num: number) => {
    if (aiGameStatus !== 'playing' || !aiSelectedCellId) return;

    const cell = aiCells.find(c => c.id === aiSelectedCellId);
    if (!cell || cell.initial || cell.claimedBy !== null) {
      handleAiDeselect();
      return;
    }

    const now = Date.now();
    const correct = isMoveCorrect(cell, num);

    if (correct) {
      const newCombo = playerStats.combo + 1;
      const baseMoveScore = calculateMoveScore(newCombo);
      const isSpeedBurstActive = Boolean(
        playerPowerState.speedBurstUntil && now <= playerPowerState.speedBurstUntil
      );
      const moveScore = isSpeedBurstActive ? Math.round(baseMoveScore * 1.5) : baseMoveScore;

      soundManager.playCorrect(newCombo);
      const isCounterSnipe = cell.id === aiTargetCellId;
      if (isCounterSnipe) {
        addNotification('🎯 BOTUN HEDEFİNİ KAPTIN!', 'correct', '#38bdf8');
        setAiTargetCellId(null);
      }

      const burstTag = isSpeedBurstActive ? ' ⚡x1.5' : '';
      const comboTag = newCombo > 1 ? ` 🔥x${newCombo}` : '';
      const feedbackText = isCounterSnipe
        ? `+${moveScore} ⚡KAPILDI!`
        : `+${moveScore}${burstTag || comboTag}`;

      const updatedCells = aiCells.map(c =>
        c.id === cell.id
          ? {
              ...c,
              value: num,
              claimedBy: 'player' as const,
              isError: false,
              justClaimed: 'player' as const,
              popupFeedback: feedbackText,
            }
          : c
      );

      setAiCells(updatedCells);

      setTimeout(() => {
        setAiCells(prev =>
          prev.map(c => (c.id === cell.id ? { ...c, justClaimed: null, popupFeedback: null } : c))
        );
      }, 1200);

      setPlayerStats(prev => ({
        ...prev,
        score: prev.score + moveScore,
        combo: newCombo,
        maxCombo: Math.max(prev.maxCombo, newCombo),
        cellsClaimed: prev.cellsClaimed + 1,
      }));

      setPlayerPowerState(prev => applyEnergyOnCorrectMove(prev, newCombo, now));

      checkBlockConquest(updatedCells, aiConqueredBlocks, 'player');
      handleAiDeselect();

      const remainingUnclaimed = updatedCells.filter(c => !c.initial && c.claimedBy === null);
      if (remainingUnclaimed.length === 0) {
        setAiGameStatus('finished');
      }
    } else {
      // WRONG ANSWER IN AI MODE:
      // Check Error Shield first, then Combo Saver, otherwise -5 penalty & combo reset
      const pState = playerPowerStateRef.current;

      if (pState.hasErrorShield) {
        soundManager.playShieldDeflect();
        setPlayerPowerState(prev => ({ ...prev, hasErrorShield: false }));
        addNotification(
          '🛡️ HATA KALKANI! -5 Ceza ve Combo Sıfırlama Engellendi!',
          'bonus',
          '#38bdf8'
        );

        setAiCells(prev =>
          prev.map(c =>
            c.id === cell.id
              ? { ...c, isError: true, popupFeedback: '🛡️ KORUNDU!' }
              : c
          )
        );
      } else if (pState.hasComboSaver) {
        soundManager.playShieldDeflect();
        setPlayerPowerState(prev => ({ ...prev, hasComboSaver: false }));

        const prevScore = playerStats.score;
        const newScore = Math.max(0, prevScore - 5);
        const scoreLost = prevScore - newScore;
        const savedCombo = Math.max(0, playerStats.combo - 1);

        addNotification(
          `🔥 COMBO KURTARICI! Combo x${savedCombo} seviyesinde korundu!`,
          'bonus',
          '#10b981'
        );

        setAiCells(prev =>
          prev.map(c =>
            c.id === cell.id
              ? { ...c, isError: true, popupFeedback: `-${scoreLost} 🔥x${savedCombo}` }
              : c
          )
        );

        setPlayerStats(prev => ({
          ...prev,
          score: newScore,
          combo: savedCombo,
        }));
      } else {
        soundManager.playWrong();

        const prevScore = playerStats.score;
        const newScore = Math.max(0, prevScore - 5);
        const scoreLost = prevScore - newScore;

        setAiCells(prev =>
          prev.map(c =>
            c.id === cell.id
              ? { ...c, isError: true, popupFeedback: `-${scoreLost} ❌` }
              : c
          )
        );

        setPlayerStats(prev => ({
          ...prev,
          score: newScore,
          combo: 0,
        }));
      }

      setTimeout(() => {
        setAiCells(prev =>
          prev.map(c => (c.id === cell.id ? { ...c, isError: false, popupFeedback: null } : c))
        );
      }, 650);

      handleAiDeselect();
    }
  };

  // AI Move Handler (Single-Player Bot)
  const handleAIMove = useCallback(
    (cellId: string, chosenNumber: number, isCorrect: boolean) => {
      setAiCells(prevCells => {
        const targetCell = prevCells.find(c => c.id === cellId);
        if (!targetCell || targetCell.initial || targetCell.claimedBy !== null) {
          return prevCells;
        }

        const now = Date.now();
        const isSteal = aiSelectedCellId === cellId;

        if (isCorrect) {
          if (isSteal) {
            soundManager.playStolen();
            handleAiDeselect();
            addNotification('⚡ BOT KAREYİ KAPTI!', 'timeout', '#f43f5e');
          } else {
            soundManager.playOpponentMove();
          }

          const newAiCombo = aiStats.combo + 1;
          const baseAiScore = calculateMoveScore(newAiCombo);
          const aiSpeedBurst = Boolean(
            aiPowerStateRef.current.speedBurstUntil &&
              now <= aiPowerStateRef.current.speedBurstUntil
          );
          const aiMoveScore = aiSpeedBurst ? Math.round(baseAiScore * 1.5) : baseAiScore;

          const nextCells = prevCells.map(c =>
            c.id === cellId
              ? {
                  ...c,
                  value: chosenNumber,
                  claimedBy: 'ai' as const,
                  isError: false,
                  justClaimed: 'ai' as const,
                  justStolen: isSteal,
                  popupFeedback: isSteal ? 'KAPTIRILDI! 🤖' : `+${aiMoveScore} 🤖`,
                }
              : c
          );

          setTimeout(() => {
            setAiCells(prev =>
              prev.map(c =>
                c.id === cellId
                  ? { ...c, justClaimed: null, justStolen: false, popupFeedback: null }
                  : c
              )
            );
          }, 1200);

          setAiStats(prev => ({
            ...prev,
            score: prev.score + aiMoveScore,
            combo: newAiCombo,
            maxCombo: Math.max(prev.maxCombo, newAiCombo),
            cellsClaimed: prev.cellsClaimed + 1,
          }));

          setAiPowerState(prev => applyEnergyOnCorrectMove(prev, newAiCombo, now));

          checkBlockConquest(nextCells, aiConqueredBlocks, 'ai');

          const remaining = nextCells.filter(c => !c.initial && c.claimedBy === null);
          if (remaining.length === 0) {
            setAiGameStatus('finished');
          }

          return nextCells;
        } else {
          // AI made an error: evaluate AI Error Shield or Combo Saver
          const aiPState = aiPowerStateRef.current;
          if (aiPState.hasErrorShield) {
            setAiPowerState(prev => ({ ...prev, hasErrorShield: false }));
          } else if (aiPState.hasComboSaver) {
            setAiPowerState(prev => ({ ...prev, hasComboSaver: false }));
            setAiStats(prev => ({
              ...prev,
              score: Math.max(0, prev.score - 5),
              combo: Math.max(0, prev.combo - 1),
            }));
          } else {
            setAiStats(prev => ({
              ...prev,
              score: Math.max(0, prev.score - 5),
              combo: 0,
            }));
          }
          return prevCells;
        }
      });
    },
    [aiSelectedCellId, aiStats.combo, aiConqueredBlocks, checkBlockConquest, addNotification]
  );

  // AI Opponent hook
  useAIOpponent({
    gameStatus: appMode === 'ai' ? aiGameStatus : 'ready',
    cells: aiCells,
    playerScore: playerStats.score,
    aiScore: aiStats.score,
    aiCombo: aiStats.combo,
    aiPowerState,
    onAIMove: handleAIMove,
    onAIUsePower: handleAIUsePower,
    onAIThinkingStatus: setAiThinking,
    onAISelectCell: setAiTargetCellId,
  });

  // If opponent claims the cell that local player currently has selected in Multiplayer, deselect it
  useEffect(() => {
    if (appMode === 'multiplayer' && mpSelectedCellId && roomState?.cells) {
      const cell = roomState.cells.find(c => c.id === mpSelectedCellId);
      if (cell && (cell.claimedBy !== null || cell.claimedByPlayerId)) {
        setMpSelectedCellId(null);
        setMpTurnTimeRemaining(null);
        if (cell.claimedByPlayerId !== multiplayerConfig.playerProfile?.id) {
          addNotification('⚡ RAKİP KAREYİ SENDEN ÖNCE KAPTI!', 'timeout', '#f43f5e');
        }
      }
    }
  }, [
    appMode,
    mpSelectedCellId,
    roomState?.cells,
    multiplayerConfig.playerProfile?.id,
    addNotification,
  ]);

  // ---------------------------------------------------------------------------
  // INPUT HANDLERS (MULTIPLAYER MODE)
  // ---------------------------------------------------------------------------
  const handleMpSelectCell = (cell: CellData) => {
    if (roomState?.status !== 'playing') return;
    if (
      mpMyPlayer.powers?.blindedUntil &&
      Date.now() < mpMyPlayer.powers.blindedUntil
    ) {
      return;
    }
    if (cell.initial || cell.claimedBy !== null) return;

    if (mpSelectedCellId === cell.id) {
      mpSelectCell(null);
      setMpSelectedCellId(null);
      setMpTurnTimeRemaining(null);
      return;
    }

    soundManager.playTap();
    setMpSelectedCellId(cell.id);
    setMpTurnTimeRemaining(TURN_DURATION);
    mpSelectCell(cell.id);
  };

  const handleMpDeselect = () => {
    mpSelectCell(null);
    setMpSelectedCellId(null);
    setMpTurnTimeRemaining(null);
  };

  const handleMpNumberSelect = (num: number) => {
    if (!mpSelectedCellId || roomState?.status !== 'playing') return;
    mpSubmitMove(mpSelectedCellId, num);
    handleMpDeselect();
  };

  const isOnlineConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  // ---------------------------------------------------------------------------
  // RENDER: LOBBY VIEW
  // ---------------------------------------------------------------------------
  if (appMode === 'lobby') {
    return (
      <div className="game-wrapper">
        <LobbyModal
          onStartAIMode={handleRequestStartAIMode}
          onHostRoom={handleRequestHostRoom}
          onJoinRoom={handleRequestJoinRoom}
          isOnlineConfigured={isOnlineConfigured}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: PRE-MATCH POWER SELECTION VIEW
  // ---------------------------------------------------------------------------
  if (appMode === 'power_select') {
    const startBtnLabel =
      pendingAction?.mode === 'host'
        ? 'ODAYI KUR VE BAŞLA'
        : pendingAction?.mode === 'join'
        ? 'ODAYA KATIL VE BAŞLA'
        : 'MAÇA BAŞLA';

    return (
      <div className="game-wrapper">
        <PowerSelectModal
          selectedPowers={selectedPowers}
          onChangeSelectedPowers={handleUpdateSelectedPowers}
          onConfirmStart={handleConfirmPowerSelection}
          onCancel={() => {
            setPendingAction(null);
            setAppMode('lobby');
          }}
          startButtonText={startBtnLabel}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: MULTIPLAYER WAITING OR CONNECTING SCREEN
  // ---------------------------------------------------------------------------
  if (appMode === 'multiplayer' && (!roomState || roomState.status === 'waiting')) {
    return (
      <div className="game-wrapper">
        <LobbyModal
          onStartAIMode={handleRequestStartAIMode}
          onHostRoom={handleRequestHostRoom}
          onJoinRoom={handleRequestJoinRoom}
          isOnlineConfigured={isOnlineConfigured}
          waitingRoomCode={multiplayerConfig.roomCode}
          isJoiningRoom={!multiplayerConfig.isHost && !roomState}
          onCancelWait={handleReturnToLobby}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: ACTIVE MATCH (AI OR MULTIPLAYER)
  // ---------------------------------------------------------------------------
  const isMultiplayer = appMode === 'multiplayer';

  // Active board cells mapping
  const activeCells = isMultiplayer
    ? (roomState?.cells || []).map(c => {
        const isMyClaim = Boolean(
          c.claimedByPlayerId && c.claimedByPlayerId === multiplayerConfig.playerProfile?.id
        );
        const isOpponentClaim = Boolean(c.claimedByPlayerId && !isMyClaim);

        const isLocalFb = mpFeedback?.cellId === c.id;

        return {
          ...c,
          claimedBy: isMyClaim ? ('player' as const) : isOpponentClaim ? ('ai' as const) : null,
          popupFeedback: isLocalFb ? mpFeedback?.text : null,
          justStolen: isLocalFb && mpFeedback?.type === 'stolen',
          justClaimed: isLocalFb && mpFeedback?.type === 'correct' ? ('player' as const) : null,
        };
      })
    : aiCells;

  const currentMatchTime = isMultiplayer ? mpMatchTimeRemaining : aiMatchTimeRemaining;
  const isFinalRush = currentMatchTime <= 60 && currentMatchTime > 0;

  // Active player stats
  const currentPlayerStats: PlayerStats = isMultiplayer
    ? {
        score: mpMyPlayer.score,
        combo: mpMyPlayer.combo,
        maxCombo: mpMyPlayer.maxCombo,
        cellsClaimed: mpMyPlayer.cellsClaimed,
        blocksWon: mpMyPlayer.blocksWon,
      }
    : playerStats;

  const currentOpponentStats: PlayerStats = isMultiplayer
    ? {
        score: mpOpponent?.score || 0,
        combo: mpOpponent?.combo || 0,
        maxCombo: mpOpponent?.maxCombo || 0,
        cellsClaimed: mpOpponent?.cellsClaimed || 0,
        blocksWon: mpOpponent?.blocksWon || 0,
      }
    : aiStats;

  const playerName = isMultiplayer
    ? multiplayerConfig.playerProfile?.nickname || 'SEN'
    : 'SEN';

  const opponentName = isMultiplayer
    ? mpOpponent?.nickname || 'RAKİP'
    : 'BOT';

  // Active conquered blocks
  const activeConqueredBlocks: Record<number, 'player' | 'ai'> = isMultiplayer
    ? Object.entries(roomState?.conqueredBlocks || {}).reduce((acc, [bIdx, pId]) => {
        acc[Number(bIdx)] = pId === multiplayerConfig.playerProfile?.id ? 'player' : 'ai';
        return acc;
      }, {} as Record<number, 'player' | 'ai'>)
    : aiConqueredBlocks;

  const currentSelectedCellId = isMultiplayer ? mpSelectedCellId : aiSelectedCellId;
  const currentOpponentSelectedCellId = isMultiplayer
    ? mpOpponent?.activeCellId || null
    : aiTargetCellId;
  const currentTurnTimeRemaining = isMultiplayer ? mpTurnTimeRemaining : aiTurnTimeRemaining;

  const currentPowerState: PlayerPowerState = isMultiplayer
    ? mpMyPlayer.powers || createInitialPowerState(selectedPowers)
    : playerPowerState;

  const activeDetectiveHint = isMultiplayer ? mpDetectiveHint : aiDetectiveHint;
  const currentDetectiveCandidates =
    activeDetectiveHint && activeDetectiveHint.cellId === currentSelectedCellId
      ? activeDetectiveHint.candidates
      : null;

  const isMatchPlaying = isMultiplayer
    ? roomState?.status === 'playing'
    : aiGameStatus === 'playing';

  const isMatchFinished = isMultiplayer
    ? roomState?.status === 'finished'
    : aiGameStatus === 'finished';

  return (
    <div className={`game-wrapper ${isFinalRush ? 'wrapper-final-rush' : ''}`}>
      <div className="game-container">
        {/* Floating notifications */}
        <FloatingNotificationView notifications={notifications} />

        {/* Synchronized 3-2-1 Countdown Overlay */}
        {countdown !== null && countdown !== undefined && (
          <CountdownOverlay
            countdown={countdown}
            player1Name={playerName}
            player2Name={opponentName}
          />
        )}

        {/* Top Header */}
        <Header
          matchTimeRemaining={currentMatchTime}
          playerStats={currentPlayerStats}
          aiStats={currentOpponentStats}
          aiThinking={aiThinking}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          isFinalRush={isFinalRush}
          playerName={playerName}
          opponentName={opponentName}
          isMultiplayer={isMultiplayer}
        />

        {/* 9x9 Sudoku Board */}
        <main className="board-main-area">
          <Board
            cells={activeCells}
            selectedCellId={currentSelectedCellId}
            opponentSelectedCellId={currentOpponentSelectedCellId}
            turnTimeRemaining={currentTurnTimeRemaining}
            onSelectCell={isMultiplayer ? handleMpSelectCell : handleAiSelectCell}
            conqueredBlocks={activeConqueredBlocks}
            isFinalRush={isFinalRush}
            detectiveCandidates={currentDetectiveCandidates}
            blindedUntil={currentPowerState.blindedUntil}
            scrambledUntil={currentPowerState.scrambledUntil}
          />
        </main>

        {/* Bottom Action Deck: Power Bar + Turn Timer + Number Pad */}
        <footer className="controls-footer">
          <PowerBar
            powerState={currentPowerState}
            onUsePower={isMultiplayer ? handleMpUsePower : handleAiUsePower}
            disabled={!isMatchPlaying || isMatchFinished}
            hasSelectedEmptyCell={currentSelectedCellId !== null}
            detectiveCandidates={currentDetectiveCandidates}
          />

          <TurnTimerBar
            turnTimeRemaining={currentTurnTimeRemaining}
            isSelected={currentSelectedCellId !== null}
            onDeselect={isMultiplayer ? handleMpDeselect : handleAiDeselect}
            combo={currentPlayerStats.combo}
          />

          <NumberPad
            onNumberSelect={isMultiplayer ? handleMpNumberSelect : handleAiNumberSelect}
            disabled={currentSelectedCellId === null || !isMatchPlaying || isMatchFinished}
            onDeselect={isMultiplayer ? handleMpDeselect : handleAiDeselect}
            candidateNumbers={currentDetectiveCandidates}
          />
        </footer>

        {/* Game Over Modal */}
        {isMatchFinished && (
          <GameOverModal
            playerStats={currentPlayerStats}
            aiStats={currentOpponentStats}
            playerName={playerName}
            opponentName={opponentName}
            onRematch={
              isMultiplayer
                ? mpRequestRematch
                : () => {
                    setPendingAction({ mode: 'ai' });
                    setAppMode('power_select');
                  }
            }
            onReturnToLobby={handleReturnToLobby}
          />
        )}
      </div>
    </div>
  );
};

export default App;
