'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTetris, Piece } from './game/useTetris';
import { COLS, ROWS, GOAL_LINES } from './game/constants';

function TetrisBoard({ playerName, onExit, isPausedExtra, volume, setVolume }: { playerName: string; onExit: () => void; isPausedExtra: (paused: boolean) => void; volume: number; setVolume: (v: number) => void }) {
  const {
    board,
    activePiece,
    nextPieces,
    holdPiece,
    ghostPos,
    linesCleared,
    score,
    time,
    isPaused,
    isGameOver,
    isVictory,
    resetGame,
    setIsPaused
  } = useTetris();

  useEffect(() => {
    isPausedExtra(isPaused);
  }, [isPaused, isPausedExtra]);

  const [rankings, setRankings] = useState<{name: string, finishtime: string}[] | null>(null);
  const [rankingError, setRankingError] = useState(false);
  const [rankingRetryFn, setRankingRetryFn] = useState<(() => void) | null>(null);

  // Combine board and active piece for rendering
  const renderBoard = board.map((row) => [...row]);

  if (activePiece && ghostPos) {
    activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const boardY = ghostPos.y + y;
          const boardX = ghostPos.x + x;
          if (boardY >= 0 && boardY < ROWS) {
            renderBoard[boardY][boardX] = `ghost-${activePiece.color}`;
          }
        }
      });
    });
  }

  if (activePiece) {
    activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const boardY = activePiece.pos.y + y;
          const boardX = activePiece.pos.x + x;
          if (boardY >= 0 && boardY < ROWS) {
            renderBoard[boardY][boardX] = activePiece.color;
          }
        }
      });
    });
  }

  // Improved preview rendering
  const renderSmallGrid = (piece: Piece | null) => {
    const grid = Array.from({ length: 4 }, () => Array(4).fill(null));
    if (piece) {
      // Offset to center different sized pieces
      const shape = piece.shape;
      const rowOffset = Math.floor((4 - shape.length) / 2);
      const colOffset = Math.floor((4 - shape[0].length) / 2);

      shape.forEach((row: number[], y: number) => {
        row.forEach((value: number, x: number) => {
          if (value !== 0) {
            const targetY = y + rowOffset;
            const targetX = x + colOffset;
            if (targetY >= 0 && targetY < 4 && targetX >= 0 && targetX < 4) {
              grid[targetY][targetX] = piece.color;
            }
          }
        });
      });
    }
    return grid.map((row, y) => (
      <div key={y} className="flex">
        {row.map((cell, x) => (
          <div
            key={x}
            className={`w-5 h-5 border-[0.5px] border-white/5 ${cell ? 'cell-filled' : ''}`}
            style={{
              backgroundColor: cell || 'transparent',
              // Smaller bevel for preview blocks
              boxShadow: cell ? 'inset 1px 1px 2px rgba(255,255,255,0.4), inset -1px -1px 2px rgba(0,0,0,0.4)' : undefined
            }}
          />
        ))}
      </div>
    ));
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  const InfoPanel = ({ label, value, className = "" }: { label: string; value: string | number; className?: string }) => (
    <div className={`relative w-64 h-10 bg-[#009bdb] border-2 border-white transform -skew-x-[25deg] flex items-center px-6 shadow-[0_0_20px_rgba(0,155,219,0.4)] ${className}`}>
      <div className="transform skew-x-[25deg] flex justify-between w-full items-center">
        <span className="text-white font-black text-[10px] tracking-widest uppercase italic">{label}</span>
        <span className="text-white font-black text-sm font-mono">{value}</span>
      </div>
    </div>
  );

  useEffect(() => {
    if (isVictory) {
      const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyLq8pfjQzNQKkQehj1QvIKad-6hOGF5tu6n52hbj881cwE5BUyMNLD4VYBWaEMRZ7B/exec";

      if (!SCRIPT_URL.startsWith("https://script.google.com")) return;

      const fetchRanking = async (retries = 3, delay = 1500): Promise<void> => {
        const fetchParams = new URLSearchParams({ action: "getRanking" });
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch(`${SCRIPT_URL}?${fetchParams.toString()}`, {
              method: 'GET',
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const rankingData = await response.json();
            
            if (Array.isArray(rankingData)) {
              setRankings(rankingData);
              setRankingError(false);
              return;
            } else {
              throw new Error("Invalid ranking data format");
            }
          } catch (e) {
            console.warn(`랭킹 로드 시도 ${attempt}/${retries} 실패:`, e);
            if (attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
          }
        }
        // 모든 재시도 실패
        setRankingError(true);
      };

      const saveAndFetchScore = async () => {
        setRankings(null);
        setRankingError(false);

        const saveParams = new URLSearchParams({
          action: "saveScore",
          name: playerName,
          finishtime: formatTime(time)
        });

        // 점수 저장 (no-cors) - 실패해도 랭킹 조회는 진행
        try {
          await fetch(`${SCRIPT_URL}?${saveParams.toString()}`, {
            method: 'GET',
            mode: 'no-cors'
          });
        } catch (e) {
          console.warn("점수 저장 요청 실패 (무시하고 랭킹 조회 진행):", e);
        }

        // Google Sheets 쓰기 전파 대기
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 랭킹 조회 (재시도 포함)
        await fetchRanking();
      };

      // 수동 재시도 함수 등록
      setRankingRetryFn(() => () => {
        setRankings(null);
        setRankingError(false);
        fetchRanking(2, 1000);
      });

      saveAndFetchScore();
    } else if (!isVictory && !isGameOver) {
      setRankings(null);
      setRankingError(false);
      setRankingRetryFn(null);
    }
  }, [isVictory, isGameOver, playerName, time]);


  return (
    <div
      className="relative w-screen h-screen flex items-center justify-center bg-[#070b14] overflow-hidden font-sans selection:bg-[#87ceeb]/30"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(135,206,235,0.05)_0%,transparent_70%)]" />

      {/* Top Left Text */}
      <h1 className="absolute top-8 left-10 text-2xl font-light text-[#87ceeb] tracking-[0.2em] uppercase opacity-90" style={{ textShadow: '0 0 15px rgba(135,206,235,0.6)' }}>
        Glacier Tetris
      </h1>

      {/* Top Right Controls Text and Pause Button */}
      <div className="absolute top-8 right-10 flex flex-col items-end gap-6">
        <button 
          onClick={() => setIsPaused(!isPaused)}
          className="flex items-center justify-center w-12 h-12 bg-black/40 border border-[#87ceeb]/30 hover:bg-[#87ceeb]/10 hover:border-[#87ceeb] transition-all shadow-[0_0_10px_rgba(135,206,235,0.1)] outline-none rounded-md"
          title="Pause Game"
        >
          <div className="flex gap-1.5">
            <div className="w-2 h-5 bg-[#87ceeb] rounded-[1px]"></div>
            <div className="w-2 h-5 bg-[#87ceeb] rounded-[1px]"></div>
          </div>
        </button>

        <div className="text-[9px] text-[#87ceeb]/40 text-right uppercase tracking-[0.2em] leading-relaxed">
          ARROWS: MOVE & DROP<br />
          Z / X: ROTATE<br />
          C: HOLD / P: PAUSE<br />
          SPACE: HARD DROP
        </div>
      </div>

      <div className="relative z-10 flex flex-row items-start gap-6 mt-8">

        {/* Left Side: HOLD */}
        <div className="flex flex-col pt-16">
          <div className="bg-[#050810]/80 border-[1.5px] border-[#87ceeb] p-1 flex flex-col shadow-[0_0_15px_rgba(135,206,235,0.4),inset_0_0_15px_rgba(135,206,235,0.2)]">
            <span className="text-[9px] font-bold text-white tracking-widest uppercase mb-1 ml-1 opacity-90">HOLD</span>
            <div className="p-1">
              {renderSmallGrid(holdPiece)}
            </div>
          </div>
        </div>

        {/* Center: Main Board */}
        <div className="flex flex-col">
          <div className="relative bg-[#02050a]/90 border-[3px] border-[#87ceeb] overflow-hidden shadow-[0_0_40px_rgba(135,206,235,0.5),inset_0_0_30px_rgba(135,206,235,0.2)]">
            <div className="relative z-10">
              {renderBoard.map((row, y) => (
                <div key={y} className="flex">
                  {row.map((cell, x) => {
                    const isGhost = typeof cell === 'string' && cell.startsWith('ghost-');
                    const cellColor = (isGhost ? (cell as string).replace('ghost-', '') : (cell as string)) || 'transparent';
                    const isFilled = typeof cell === 'string' && cell !== '' && !isGhost;

                    return (
                      <div
                        key={x}
                        className={`cell ${isGhost ? 'ghost' : ''} ${isFilled ? 'cell-filled' : ''}`}
                        style={{
                          backgroundColor: isFilled ? cellColor : (isGhost ? `${cellColor}1A` : 'transparent'),
                          borderColor: isFilled ? 'rgba(255,255,255,0.4)' : (isGhost ? `${cellColor}60` : 'rgba(255,255,255,0.06)')
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {isPaused && !isGameOver && !isVictory && (
              <div className="absolute inset-0 z-20 bg-[#070b14]/90 flex flex-col items-center justify-center backdrop-blur-[3px] gap-8">
                <h1 className="text-4xl font-black text-[#87ceeb] italic tracking-widest" style={{ textShadow: '0 0 20px rgba(135,206,235,0.8)' }}>PAUSED</h1>
                <div className="flex flex-col gap-4 w-48">
                  <button
                    onClick={() => setIsPaused(false)}
                    className="w-full py-3 bg-[#121824] border border-[#87ceeb]/50 text-[#aeddf5] hover:bg-[#151c2a] hover:border-[#87ceeb] shadow-[0_0_15px_rgba(135,206,235,0.1)] font-bold text-xs uppercase tracking-widest transition-all outline-none"
                  >
                    Resume
                  </button>
                  <button
                    onClick={resetGame}
                    className="w-full py-3 bg-indigo-950/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-950/40 hover:border-indigo-500/80 shadow-[0_0_15px_rgba(99,102,241,0.05)] hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] font-bold text-xs uppercase tracking-widest transition-all outline-none"
                  >
                    Restart Game
                  </button>
                  <button
                    onClick={onExit}
                    className="w-full py-3 bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-950/40 hover:border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.05)] hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold text-xs uppercase tracking-widest transition-all outline-none"
                  >
                    Quit to Menu
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: NEXT and INFO */}
        <div className="flex flex-row gap-6">
          {/* NEXT Queue */}
          <div className="flex flex-col gap-1">
            <div className="bg-[#050810]/80 border-[1.5px] border-[#87ceeb] p-1 flex flex-col shadow-[0_0_15px_rgba(135,206,235,0.4),inset_0_0_15px_rgba(135,206,235,0.2)]">
              <span className="text-[9px] font-bold text-white tracking-widest uppercase mb-1 ml-1 opacity-90">NEXT</span>
              <div className="p-1">
                {renderSmallGrid(nextPieces[0] || null)}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {[1, 2, 3, 4].map((idx) => (
                <div key={idx} className="bg-[#050810]/80 border-[1.5px] border-[#87ceeb]/80 p-1 shadow-[0_0_10px_rgba(135,206,235,0.2),inset_0_0_10px_rgba(135,206,235,0.1)]">
                  {renderSmallGrid(nextPieces[idx] || null)}
                </div>
              ))}
            </div>
          </div>

          {/* info Panels */}
          <div className="flex flex-col gap-3 pt-12">
            <InfoPanel label="NAME" value={playerName || "UNKNOWN"} />
            <InfoPanel label="MISSION GOAL" value={`${linesCleared}/${GOAL_LINES}`} />
            <InfoPanel label="TIME" value={formatTime(time)} />
          </div>
        </div>
      </div>

      {/* Game Over / Victory Modals */}
      {(isGameOver || isVictory) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#070b14]/90 backdrop-blur-md">
          <div className="p-12 flex flex-col items-center text-center max-w-md border-2 border-[#87ceeb] bg-[#050810] shadow-[0_0_50px_rgba(135,206,235,0.4)]">
            <h1 className="text-5xl font-black text-[#87ceeb] italic mb-2 tracking-tighter" style={{ textShadow: '0 0 20px rgba(135,206,235,0.8)' }}>
              {isVictory ? 'MISSION COMPLETE' : 'SYSTEM FAILURE'}
            </h1>
            <div className={`text-3xl font-mono font-bold text-white ${isVictory ? 'mb-4' : 'mb-8'} border-y border-[#87ceeb]/30 py-4 w-full`}>
              {isVictory ? `TIME: ${formatTime(time)}` : `SCORE: ${score}`}
            </div>

            {isVictory && (
              <div className="w-full mb-6 bg-black/40 border border-[#87ceeb]/20 p-5 flex flex-col gap-3">
                <h2 className="text-[#87ceeb] font-bold text-sm tracking-widest text-center">TOP 3 RANKING</h2>
                {rankings ? (
                  <div className="flex flex-col gap-2">
                    {rankings.map((rk, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs font-mono bg-white/5 p-2 px-3">
                        <div className="flex gap-4">
                          <span className={idx === 0 ? "text-yellow-400 font-black" : idx === 1 ? "text-gray-300 font-bold" : "text-amber-600 font-semibold"}>
                            {idx + 1}ST
                          </span>
                          <span className="text-white text-left font-sans">{rk.name.length > 10 ? rk.name.substring(0, 10) + '...' : rk.name}</span>
                        </div>
                        <span className="text-white font-bold tracking-widest">{rk.finishtime}</span>
                      </div>
                    ))}
                  </div>
                ) : rankingError ? (
                  <div className="flex flex-col items-center gap-3 py-3">
                    <div className="text-xs text-red-400/80 text-center tracking-wider uppercase">랭킹 로드 실패</div>
                    <button
                      onClick={() => rankingRetryFn?.()}
                      className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[#87ceeb] border border-[#87ceeb]/30 bg-[#87ceeb]/5 hover:bg-[#87ceeb]/15 hover:border-[#87ceeb]/60 transition-all outline-none"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-white/50 animate-pulse text-center py-4 tracking-widest uppercase">Loading Core Data...</div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={resetGame}
                className="w-full py-4 bg-white/10 text-[#87ceeb] hover:bg-[#87ceeb] hover:text-black font-black uppercase tracking-[0.2em] transform hover:scale-[1.02] active:scale-95 transition-all outline-none border border-[#87ceeb]/30 hover:border-[#87ceeb]"
              >
                Restart Simulation
              </button>
              <button
                onClick={onExit}
                className="w-full py-3 bg-red-950/20 text-red-500 hover:bg-red-600 hover:text-white font-bold uppercase tracking-[0.2em] transform hover:scale-[1.02] active:scale-95 transition-all outline-none border border-red-500/30 hover:border-red-500"
              >
                Quit to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Left HUD */}
      <div className="absolute bottom-6 left-8 flex flex-col gap-4">
        <VolumeControl volume={volume} setVolume={setVolume} compact />
        <div className="flex gap-8 text-[9px] font-bold text-white/30 tracking-[0.3em] uppercase">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]" />
            CORE STATUS: OPTIMAL
          </div>
          <div>SECTOR: G-09</div>
        </div>
      </div>
    </div>
  );
}

function VolumeControl({ volume, setVolume, compact = false }: { volume: number; setVolume: (v: number) => void; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? 'opacity-60 hover:opacity-100 transition-opacity' : ''}`}>
      <svg xmlns="http://www.w3.org/2000/svg" width={compact ? "14" : "18"} height={compact ? "14" : "18"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#87ceeb]"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.01" 
        value={volume} 
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        className="w-20 md:w-24 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#87ceeb]"
      />
    </div>
  );
}

function BGMPlayer({ isPlaying, isPaused, volume }: { isPlaying: boolean; isPaused: boolean; volume: number }) {
  const menuAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (menuAudioRef.current) menuAudioRef.current.volume = volume;
    if (gameAudioRef.current) gameAudioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const menu = menuAudioRef.current;
    const game = gameAudioRef.current;
    if (!menu || !game) return;

    if (!isPlaying) {
      game.pause();
      game.currentTime = 0;
      menu.play().catch(() => {
         const handleInteraction = () => {
           menu.play().catch(() => {});
           window.removeEventListener('click', handleInteraction);
         };
         window.addEventListener('click', handleInteraction);
      });
    } else {
      menu.pause();
      if (isPaused) {
        game.pause();
      } else {
        game.play().catch(() => {});
      }
    }
  }, [isPlaying, isPaused]);

  return (
    <>
      <audio 
        ref={menuAudioRef} 
        src="/music/menu.mp3" 
        loop 
      />
      <audio 
        ref={gameAudioRef} 
        src="/music/game.mp3" 
        loop 
      />
    </>
  );
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [playerName, setPlayerName] = useState('');

  if (!isPlaying) {
    return (
      <div className="relative w-screen h-screen flex flex-col items-center justify-center bg-[#0a0f1d] overflow-hidden font-sans selection:bg-[#87ceeb]/30">
        {/* Header */}
        <header className="absolute top-0 w-full flex justify-between items-center px-8 py-5 border-b border-white/5 bg-[#0a0f1d]/50 backdrop-blur-md z-20">
          <div className="text-[#87ceeb] text-lg font-semibold tracking-wide">Glacier Tetris</div>
          <div className="flex items-center gap-8">
            <VolumeControl volume={volume} setVolume={setVolume} />
            <div className="flex gap-4">
              <button className="text-white/40 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
              <button className="text-white/40 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
              </button>
            </div>
          </div>
        </header>

        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#87ceeb]/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Main Content */}
        <div className="relative z-10 flex flex-col items-center">
          <h1
            className="text-7xl md:text-8xl font-black text-[#aeddf5] text-center leading-[0.9] tracking-tighter"
            style={{ textShadow: '0 0 40px rgba(135,206,235,0.4), 0 0 15px rgba(135,206,235,0.6)' }}
          >
            GLACIER<br />TETRIS
          </h1>

          <div className="flex flex-col gap-4 w-full max-w-[320px] mt-16">
            <input
              type="text"
              maxLength={12}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-6 py-4 rounded-[1.25rem] bg-[#121824] border border-white/10 text-white/90 placeholder:text-white/30 text-[15px] focus:outline-none focus:border-[#87ceeb]/50 focus:bg-[#151c2a] transition-all"
              placeholder="이름을 입력하세요"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && playerName.trim()) {
                  setIsPlaying(true);
                }
              }}
            />

            <button
              onClick={() => setIsPlaying(true)}
              disabled={!playerName.trim()}
              className="w-full py-4 rounded-[1.25rem] bg-[#17202d] border border-[#87ceeb]/20 text-[#aeddf5] font-bold text-[13px] tracking-wider uppercase hover:bg-[#1d2737] hover:border-[#87ceeb]/40 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:hover:bg-[#17202d] disabled:hover:border-[#87ceeb]/20 transition-all shadow-[0_0_20px_rgba(135,206,235,0.05)] hover:shadow-[0_0_25px_rgba(135,206,235,0.15)]"
            >
              START
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 flex flex-col items-center gap-1.5 opacity-40">
          <div className="text-[10px] text-white/60 tracking-wider font-light">
            AI코딩을활용한창의적앱개발 건설환경공학 202502079 권도현
          </div>
          <div className="text-[8px] text-[#87ceeb]/40 tracking-[0.2em] font-medium uppercase">
            VER. 2.0.4 • HIGH PERFORMANCE GLASS ENGINE
          </div>
        </div>
        <BGMPlayer isPlaying={isPlaying} isPaused={false} volume={volume} />
      </div>
    );
  }

  return (
    <>
      <TetrisBoard 
        playerName={playerName} 
        onExit={() => setIsPlaying(false)} 
        isPausedExtra={setIsPaused} 
        volume={volume}
        setVolume={setVolume}
      />
      <BGMPlayer isPlaying={isPlaying} isPaused={isPaused} volume={volume} />
    </>
  );
}
