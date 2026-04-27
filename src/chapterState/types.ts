export interface NewCharacter {
  name: string;
  description: string;
  firstAppearance: number;
}

export interface CharacterAction {
  characterName: string;
  action: string;
}

export interface RelationshipChange {
  char1: string;
  char2: string;
  oldType: string;
  newType: string;
}

export interface ForeshadowingItem {
  id: string;
  description: string;
  plantedChapter: number;
  suggestedResolveChapter?: number;
  status: 'planted' | 'resolved';
  resolvedChapter?: number;
}

export interface TimelineEvent {
  event: string;
  timestamp: string;
  timestampType: 'absolute' | 'relative' | 'vague';
  chapter: number;
}

export interface StorylineItem {
  name: string;
  type: 'main' | 'sub' | 'hidden';
  description: string;
  introducedChapter: number;
}

export interface ChapterStateExtracted {
  newCharacters:       NewCharacter[];
  characterActions:    CharacterAction[];
  relationshipChanges: RelationshipChange[];
  foreshadowingPlanted:   ForeshadowingItem[];
  foreshadowingResolved:  string[];
  timelineEvents:      TimelineEvent[];
  newStorylines:       StorylineItem[];
  advancedStorylines:  Array<{ name: string; progressSummary: string }>;
}
