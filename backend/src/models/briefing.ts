export interface Briefing {
  id: string;
  owner_id: string;
  date: Date;
  content: string;
  generated_at: Date;
  viewed_at: Date | null;
}

export interface CreateBriefingInput {
  owner_id: string;
  date: Date;
  content: string;
}
