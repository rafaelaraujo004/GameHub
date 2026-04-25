export interface Game {
  id: string;
  userId: string;
  name: string;
  platform: string;
  link: string;
  linkType: 'drive' | 'mega' | 'local' | 'other';
  coverUrl: string;
  metadataCoverUrl?: string;
  metadataId?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type GameFormData = Pick<Game, 'name' | 'platform' | 'link' | 'coverUrl' | 'metadataCoverUrl' | 'metadataId' | 'description'>;
