'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { COLS, ROWS, TETROMINOS, TetrominoType, INITIAL_DROP_SPEED, SOFT_DROP_SPEED, GOAL_LINES, SRS_KICKS, SRS_I_KICKS } from './constants';

export type Piece = {
  pos: { x: number; y: number };
  shape: number[][];
  color: string;
  type: TetrominoType;
  rotation: number; // 0: spawn, 1: CW, 2: 180, 3: CCW
};

export const useTetris = () => {
  const [board, setBoard] = useState<(string | null)[][]>(
    Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  );
  const [activePiece, setActivePiece] = useState<Piece | null>(null);
  const [nextPieces, setNextPieces] = useState<Piece[]>([]);
  const [holdPiece, setHoldPiece] = useState<Piece | null>(null);
  const [canHold, setCanHold] = useState(true);
  const [linesCleared, setLinesCleared] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0); // in milliseconds

  const dropTimeRef = useRef<number>(INITIAL_DROP_SPEED);
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const bagRef = useRef<TetrominoType[]>([]);
  const queueRef = useRef<Piece[]>([]);

  const lockDelayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const absoluteLockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lockDelayMovesCountRef = useRef(0);
  const activePieceRef = useRef<Piece | null>(null);
  const [lockTrigger, setLockTrigger] = useState(0);

  useEffect(() => {
    activePieceRef.current = activePiece;
  }, [activePiece]);

  const clearLockDelay = useCallback(() => {
    if (lockDelayTimerRef.current) {
      clearTimeout(lockDelayTimerRef.current);
      lockDelayTimerRef.current = null;
    }
    if (absoluteLockTimerRef.current) {
      clearTimeout(absoluteLockTimerRef.current);
      absoluteLockTimerRef.current = null;
    }
  }, []);

  const getRandomPiece = useCallback((): Piece => {
    if (bagRef.current.length === 0) {
      const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      bagRef.current = types;
    }
    const type = bagRef.current.pop()!;
    const data = TETROMINOS[type];
    return {
      pos: { x: Math.floor(COLS / 2) - Math.floor(data.shape[0].length / 2), y: 0 },
      shape: data.shape,
      color: data.color,
      type,
      rotation: 0,
    };
  }, []);

  const checkCollisionAt = useCallback((x: number, y: number, shape: number[][], currentBoard = board) => {
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col] !== 0) {
          const newX = x + col;
          const newY = y + row;
          if (
            newX < 0 ||
            newX >= COLS ||
            newY >= ROWS ||
            (newY >= 0 && currentBoard[newY][newX] !== null)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }, [board]);

  const spawnPiece = useCallback(() => {
    lockDelayMovesCountRef.current = 0;
    // Initialize queue if empty
    while (queueRef.current.length < 5) {
      queueRef.current.push(getRandomPiece());
    }

    const next = queueRef.current.shift()!;
    queueRef.current.push(getRandomPiece());
    
    // Check game over
    if (checkCollisionAt(next.pos.x, next.pos.y, next.shape)) {
      setIsGameOver(true);
      return;
    }

    setActivePiece(next);
    setNextPieces([...queueRef.current]);
    setCanHold(true);
    setLockTrigger(0);
  }, [getRandomPiece, checkCollisionAt]);

  const handleLockDelayReset = (newShape: number[][], newX: number, newY: number) => {
    if (!checkCollisionAt(newX, newY + 1, newShape)) {
      clearLockDelay();
    } else {
      lockDelayMovesCountRef.current += 1;
      if (lockDelayMovesCountRef.current >= 15) {
        setLockTrigger(prev => prev + 1);
        return;
      }
      if (lockDelayTimerRef.current) {
        clearTimeout(lockDelayTimerRef.current);
        lockDelayTimerRef.current = null;
      }
      lockDelayTimerRef.current = setTimeout(() => {
        setLockTrigger(prev => prev + 1);
      }, 2000);
    }
  };

  const rotate = (dir: number) => {
    if (!activePiece || isPaused || isGameOver || isVictory) return;

    const shape = activePiece.shape;
    const newShape = shape[0].map((_, index) =>
      dir > 0 
        ? shape.map((row) => row[index]).reverse() // CW
        : shape.map((row) => row[row.length - 1 - index]) // CCW
    );

    if (activePiece.type === 'O') return;

    const fromState = activePiece.rotation;
    const toState = (fromState + (dir > 0 ? 1 : 3)) % 4;
    const kickKey = `${fromState}-${toState}`;
    const kickData = activePiece.type === 'I' ? SRS_I_KICKS[kickKey] : SRS_KICKS[kickKey];

    if (!kickData) return;

    for (const [kx, ky] of kickData) {
      const newX = activePiece.pos.x + kx;
      const newY = activePiece.pos.y - ky; // Kick data is Y-up, board is Y-down
      
      if (!checkCollisionAt(newX, newY, newShape)) {
        handleLockDelayReset(newShape, newX, newY);
        setActivePiece({
          ...activePiece,
          pos: { x: newX, y: newY },
          shape: newShape,
          rotation: toState
        });
        return;
      }
    }
  };

  const move = (dir: number) => {
    if (!activePiece || isPaused || isGameOver || isVictory) return;
    const newX = activePiece.pos.x + dir;
    const newY = activePiece.pos.y;
    if (!checkCollisionAt(newX, newY, activePiece.shape)) {
      handleLockDelayReset(activePiece.shape, newX, newY);
      setActivePiece({ ...activePiece, pos: { ...activePiece.pos, x: newX } });
    }
  };

  const lockPiece = useCallback(() => {
    if (!activePiece) return;
    const newBoard = board.map((row) => [...row]);
    activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const boardY = activePiece.pos.y + y;
          const boardX = activePiece.pos.x + x;
          if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
            newBoard[boardY][boardX] = activePiece.color;
          }
        }
      });
    });

    // Clear lines
    let rowsCleared = 0;
    const filteredBoard = newBoard.filter((row) => {
      if (row.every((cell) => cell !== null)) {
        rowsCleared++;
        return false;
      }
      return true;
    });

    while (filteredBoard.length < ROWS) {
      filteredBoard.unshift(Array(COLS).fill(null));
    }

    setBoard(filteredBoard);
    setLinesCleared((prev) => {
      const next = prev + rowsCleared;
      if (next >= GOAL_LINES) {
        setIsVictory(true);
      }
      return next;
    });
    setScore((prev) => prev + rowsCleared * 100);
    spawnPiece();
  }, [activePiece, board, spawnPiece]);

  useEffect(() => {
    if (lockTrigger > 0) {
      if (activePieceRef.current && checkCollisionAt(activePieceRef.current.pos.x, activePieceRef.current.pos.y + 1, activePieceRef.current.shape, board)) {
        lockPiece();
        clearLockDelay();
      }
    }
  }, [lockTrigger, checkCollisionAt, lockPiece, board, clearLockDelay]);

  const drop = useCallback(() => {
    if (!activePiece || isPaused || isGameOver || isVictory) return;
    if (!checkCollisionAt(activePiece.pos.x, activePiece.pos.y + 1, activePiece.shape)) {
      clearLockDelay();
      setActivePiece({ ...activePiece, pos: { ...activePiece.pos, y: activePiece.pos.y + 1 } });
    } else {
      if (!lockDelayTimerRef.current) {
        lockDelayTimerRef.current = setTimeout(() => {
          setLockTrigger(prev => prev + 1);
        }, 2000);
      }
      if (!absoluteLockTimerRef.current) {
        absoluteLockTimerRef.current = setTimeout(() => {
          setLockTrigger(prev => prev + 1);
        }, 3000);
      }
    }
  }, [activePiece, checkCollisionAt, isPaused, isGameOver, isVictory, clearLockDelay]);

  const hardDrop = () => {
    if (!activePiece || isPaused || isGameOver || isVictory) return;
    clearLockDelay();
    let y = activePiece.pos.y;
    while (!checkCollisionAt(activePiece.pos.x, y + 1, activePiece.shape)) {
      y++;
    }
    setActivePiece({ ...activePiece, pos: { ...activePiece.pos, y } });
    // Force immediate lock in next tick or now
    // Better to update state immediately and manually call lock
    const finalPiece = { ...activePiece, pos: { ...activePiece.pos, y } };
    
    // Manual lock logic for hard drop
    const newBoard = board.map((row) => [...row]);
    finalPiece.shape.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value !== 0) {
          const boardY = finalPiece.pos.y + dy;
          const boardX = finalPiece.pos.x + dx;
          if (boardY >= 0 && boardY < ROWS) {
            newBoard[boardY][boardX] = finalPiece.color;
          }
        }
      });
    });

    let rowsCleared = 0;
    const filteredBoard = newBoard.filter((row) => {
      if (row.every((cell) => cell !== null)) {
        rowsCleared++;
        return false;
      }
      return true;
    });
    while (filteredBoard.length < ROWS) {
      filteredBoard.unshift(Array(COLS).fill(null));
    }
    setBoard(filteredBoard);
    setLinesCleared((prev) => {
      const next = prev + rowsCleared;
      if (next >= GOAL_LINES) setIsVictory(true);
      return next;
    });
    setScore((prev) => prev + (rowsCleared * 100) + 10); // small bonus for hard drop
    spawnPiece();
  };

  const hold = () => {
    if (!activePiece || !canHold || isPaused || isGameOver || isVictory) return;
    clearLockDelay();
    
    const currentType = activePiece.type;
    const newPiece = holdPiece ? {
      ...holdPiece,
      pos: { x: Math.floor(COLS / 2) - Math.floor(holdPiece.shape[0].length / 2), y: 0 },
      rotation: 0,
      shape: TETROMINOS[holdPiece.type].shape // Reset shape to spawn orientation
    } : null;

    setHoldPiece({
      ...TETROMINOS[currentType],
      type: currentType,
      pos: { x: 0, y: 0 },
      rotation: 0
    });

    if (newPiece) {
      setActivePiece(newPiece);
    } else {
      spawnPiece();
    }
    setCanHold(false);
  };

  const resetGame = () => {
    clearLockDelay();
    bagRef.current = [];
    queueRef.current = [];
    setBoard(Array.from({ length: ROWS }, () => Array(COLS).fill(null)));
    setActivePiece(null);
    setNextPieces([]);
    setHoldPiece(null);
    setLinesCleared(0);
    setScore(0);
    setIsGameOver(false);
    setIsVictory(false);
    setIsPaused(false);
    setCanHold(true);
    setTime(0);
  };

  // Ghost Piece Calculation
  const getGhostPos = () => {
    if (!activePiece) return null;
    let y = activePiece.pos.y;
    while (!checkCollisionAt(activePiece.pos.x, y + 1, activePiece.shape)) {
      y++;
    }
    return { ...activePiece.pos, y };
  };

  // Keyboard Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGameOver || isVictory) return;
      
      switch (e.key.toLowerCase()) {
        case 'arrowup': e.preventDefault(); rotate(1); break;
        case 'arrowleft': move(-1); break;
        case 'arrowright': move(1); break;
        case 'arrowdown': e.preventDefault(); drop(); break;
        case ' ': e.preventDefault(); hardDrop(); break;
        case 'z': rotate(-1); break;
        case 'x': rotate(1); break;
        case 'c': hold(); break;
        case 'p': setIsPaused((prev) => !prev); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move, drop, hardDrop, rotate, hold, isGameOver, isVictory, isPaused]);

  // Stable Tick Logic
  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  }, [drop]);

  useEffect(() => {
    if (isPaused || isGameOver || isVictory) return;
    
    const interval = setInterval(() => {
      dropRef.current();
    }, INITIAL_DROP_SPEED);

    return () => clearInterval(interval);
  }, [isPaused, isGameOver, isVictory]); 

  // Timer logic
  useEffect(() => {
    if (isPaused || isGameOver || isVictory) return;
    
    const interval = setInterval(() => {
      setTime((prev) => prev + 10);
    }, 10);

    return () => clearInterval(interval);
  }, [isPaused, isGameOver, isVictory]);

  // Spawn initial piece
  useEffect(() => {
    if (!activePiece && !isGameOver && !isVictory) {
      if (queueRef.current.length === 0) {
        spawnPiece();
      }
    }
  }, [activePiece, isGameOver, isVictory, spawnPiece]);

  return {
    board,
    activePiece,
    nextPieces,
    holdPiece,
    ghostPos: getGhostPos(),
    linesCleared,
    score,
    time,
    isPaused,
    isGameOver,
    isVictory,
    resetGame,
    setIsPaused,
  };
};
