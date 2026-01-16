// src/hooks/useGameSounds.ts
import { useCallback } from 'react';

export const useGameSounds = () => {
  const playSpin = useCallback(() => {
    const audio = new Audio('/sounds/spin.mp3'); // ודא שהקובץ קיים בתיקיית public/sounds
    audio.play().catch(() => console.log('Audio play failed'));
  }, []);

  const playShot = useCallback(() => {
    const audio = new Audio('/sounds/shot.mp3'); 
    audio.play().catch(() => console.log('Audio play failed'));
  }, []);

  const playWin = useCallback(() => {
    const audio = new Audio('/sounds/win.mp3'); 
    audio.play().catch(() => console.log('Audio play failed'));
  }, []);

  return { playSpin, playShot, playWin };
};