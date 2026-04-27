import { useCallback, useState } from 'react';
import { magnifyOutlineToBeats } from '../beats/beatEngine';
import type { Beat, BeatFocus } from '../beats/types';
import { generateId } from '../utils/id';
import { generateBeatSheetFromBackend } from '../api/beats';

export function useBeats() {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [activeBeatIdx, setActiveBeatIdx] = useState<number>(0);

  const generateBeats = useCallback((
    chapterNumber: number,
    outline: string,
    targetWords = 3000,
  ) => {
    const generated = magnifyOutlineToBeats(chapterNumber, outline, targetWords);
    setBeats(generated);
    setActiveBeatIdx(0);
  }, []);

  const addBeat = useCallback((focus: BeatFocus, description: string, targetWords: number) => {
    setBeats(prev => [
      ...prev,
      { id: generateId(), description, targetWords, focus, status: 'pending' },
    ]);
  }, []);

  const removeBeat = useCallback((id: string) => {
    setBeats(prev => prev.filter(b => b.id !== id));
  }, []);

  const reorderBeats = useCallback((fromIdx: number, toIdx: number) => {
    setBeats(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const completeBeat = useCallback((id: string, content: string) => {
    const beatIdx = beats.findIndex(beat => beat.id === id);
    if (beatIdx === -1) return;

    const nextBeats = beats.map(beat => (
      beat.id === id ? { ...beat, status: 'done' as const, content } : beat
    ));

    setBeats(nextBeats);

    const nextPendingIdx = nextBeats.findIndex((beat, idx) => idx > beatIdx && beat.status !== 'done');
    if (nextPendingIdx >= 0) {
      setActiveBeatIdx(nextPendingIdx);
      return;
    }

    const firstPendingIdx = nextBeats.findIndex(beat => beat.status !== 'done');
    setActiveBeatIdx(firstPendingIdx >= 0 ? firstPendingIdx : Math.min(beatIdx, nextBeats.length - 1));
  }, [beats]);

  const clearBeats = useCallback(() => {
    setBeats([]);
    setActiveBeatIdx(0);
  }, []);

  const generateBeatsFromBackend = useCallback(async (
    chapterId: string,
    outline: string,
  ): Promise<boolean> => {
    const backendBeats = await generateBeatSheetFromBackend(chapterId, outline);
    if (!backendBeats || backendBeats.length === 0) return false;
    setBeats(backendBeats);
    setActiveBeatIdx(0);
    return true;
  }, []);

  const activeBeat = beats[activeBeatIdx] ?? null;
  const allDone = beats.length > 0 && beats.every(b => b.status === 'done');
  const progress = beats.length > 0 ? beats.filter(b => b.status === 'done').length / beats.length : 0;

  return {
    beats,
    activeBeat,
    activeBeatIdx,
    allDone,
    progress,
    generateBeats,
    generateBeatsFromBackend,
    addBeat,
    removeBeat,
    reorderBeats,
    completeBeat,
    clearBeats,
    setActiveBeatIdx,
  };
}
