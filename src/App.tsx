/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameOverModal, LevelUpModal, PauseModal } from './components/Modals';
import { TitleOverlay } from './components/TitleOverlay';
import { loadSaveData, persistSaveData } from './game/data';
import { InkNightEngine } from './game/engine';
import {
  appGameReducer,
  createInitialAppGameState,
  gameActions,
} from './game/gameReducer';
import { purchaseMetaUpgrade } from './game/rulesEngine';
import type { MetaUpgradeId, RunSummary, SaveData, UpgradeId } from './game/types';

export default function App() {
  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [gameState, dispatch] = useReducer(
    appGameReducer,
    saveData.muted,
    createInitialAppGameState
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<InkNightEngine | null>(null);
  const saveRef = useRef<SaveData>(saveData);
  saveRef.current = saveData;

  const handleRunFinished = useCallback((summary: RunSummary) => {
    setSaveData((prev) => {
      const next: SaveData = {
        ...prev,
        coins: prev.coins + summary.coinsEarned,
        bestTime: Math.max(prev.bestTime, summary.timeSec),
        bestKills: Math.max(prev.bestKills, summary.kills),
        totalRuns: prev.totalRuns + 1,
        victories: prev.victories + (summary.victory ? 1 : 0),
      };
      persistSaveData(next);
      engineRef.current?.updateSaveData(next);
      return next;
    });
  }, []);

  // Mount isolated 60fps Canvas simulation engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new InkNightEngine(canvas, saveRef.current, {
      onHudUpdate: (snapshot) => {
        dispatch(gameActions.syncSnapshot(snapshot));
      },
      onRunFinished: handleRunFinished,
    });
    engineRef.current = engine;
    engine.start();

    // Support ?autostart=1 for instant gameplay boot
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      document.body.dataset.state = 'playing';
      engine.startNewRun();
    } else {
      document.body.dataset.state = 'title';
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleRunFinished]);

  // Mirror state machine to document.body.dataset.state for deterministic inspection
  useEffect(() => {
    const mapped =
      gameState.phase === 'levelup'
        ? 'paused'
        : gameState.phase;
    document.body.dataset.state = mapped;
    document.body.dataset.world = gameState.worldPhase;
  }, [gameState.phase, gameState.worldPhase]);

  const handleStartGame = useCallback(() => {
    document.body.dataset.state = 'playing';
    engineRef.current?.startNewRun();
  }, []);

  // Bind Enter / Space on Title screen to immediately start gameplay
  useEffect(() => {
    if (gameState.phase !== 'title') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        // Ignore if a modal dialog (e.g. Bag) is open
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        handleStartGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState.phase, handleStartGame]);

  const handleReturnTitle = useCallback(() => {
    document.body.dataset.state = 'title';
    engineRef.current?.returnToTitle();
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleToggleMute = useCallback(() => {
    setSaveData((prev) => {
      const next = { ...prev, muted: !prev.muted };
      persistSaveData(next);
      engineRef.current?.setMuted(next.muted);
      dispatch(gameActions.setMuted(next.muted));
      return next;
    });
  }, []);

  const handlePurchaseMeta = useCallback((id: MetaUpgradeId) => {
    setSaveData((prev) => {
      const updated = purchaseMetaUpgrade(prev, id);
      if (!updated) return prev;
      persistSaveData(updated);
      engineRef.current?.updateSaveData(updated);
      return updated;
    });
  }, []);

  const handleSelectUpgrade = useCallback((id: UpgradeId) => {
    engineRef.current?.selectUpgrade(id);
  }, []);

  const handleTriggerFlip = useCallback(() => {
    engineRef.current?.triggerRealmFlipFromUi();
  }, []);

  const handleTriggerFaceToggle = useCallback(() => {
    engineRef.current?.triggerFaceToggleFromUi();
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#06090B]">
      {/* Isolated full-bleed 60fps Canvas2D viewport */}
      <div className="fixed inset-0 z-0">
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          className="block w-full h-full"
        />
      </div>

      {/* Title Screen */}
      {gameState.phase === 'title' && (
        <TitleOverlay
          saveData={saveData}
          onStart={handleStartGame}
          onPurchaseMeta={handlePurchaseMeta}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Active Playing / Paused / Level-Up HUD */}
      {gameState.phase !== 'title' && (
        <GameHud
          hud={gameState.hud}
          onTogglePause={handleTogglePause}
          onToggleMute={handleToggleMute}
          onTriggerFlip={handleTriggerFlip}
          onTriggerFaceToggle={handleTriggerFaceToggle}
        />
      )}

      {/* Level-Up 3-Choice Scroll Modal */}
      {gameState.phase === 'levelup' && gameState.hud.upgradeChoices.length > 0 && (
        <LevelUpModal
          level={gameState.hud.level}
          choices={gameState.hud.upgradeChoices}
          onSelect={handleSelectUpgrade}
        />
      )}

      {/* Pause Modal */}
      {gameState.phase === 'paused' && (
        <PauseModal
          onResume={handleTogglePause}
          onRestart={handleStartGame}
          onTitle={handleReturnTitle}
        />
      )}

      {/* Victory / Defeat Summary Modal */}
      {gameState.phase === 'gameover' && gameState.hud.endSummary && (
        <GameOverModal
          summary={gameState.hud.endSummary}
          onRestart={handleStartGame}
          onTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}
