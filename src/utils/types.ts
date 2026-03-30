export interface SearchMentorResult {
    id: number;
    name: string;
    researchDirection: string;
    email?: string;
    profile?: string;
    paperTitles: string[];
}

export interface SearchPaperResult {
    id: number;
    title: string;
    abstract?: string;
    publishDate?: string;
    mentorNames: string[];
}
