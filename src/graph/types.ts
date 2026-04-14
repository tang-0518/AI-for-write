// =============================================================
// graph/types.ts — 知识图谱类型定义
// =============================================================

export type NovelEntityType =
  | 'character' | 'location' | 'event'
  | 'item' | 'faction' | 'world_rule' | 'plot_hook';

export interface NovelEntity {
  id:           string;
  bookId:       string;
  name:         string;
  type:         NovelEntityType;
  attributes:   Record<string, string>;
  observations: string[];
  firstChapter?: number;
  tags:         string[];
  source:       'auto_extract' | 'manual';
  createdAt:    number;
  updatedAt:    number;
}

export interface NovelRelation {
  id:           string;
  bookId:       string;
  from:         string;
  to:           string;
  relationType: string;
  weight:       number;
  notes?:       string;
  chapter?:     number;
  source:       'auto_extract' | 'manual';
  createdAt:    number;
}

export interface NovelGraph {
  bookId:    string;
  entities:  NovelEntity[];
  relations: NovelRelation[];
}

export interface GraphStats {
  bookId:        string;
  entityCount:   number;
  relationCount: number;
  byType:        Record<string, number>;
}
