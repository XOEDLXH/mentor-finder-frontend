export interface SearchMentorResult {
    id: number;
    name: string;
    researchDirection?: string;
    research_direction?: string;
    email?: string;
    profile?: string;
    paperTitles: string[];
}

export interface SearchPaperResult {
    id: number;
    title: string;
    abstract?: string;
    publishDate?: string;
    publish_date?: string;
    mentorNames: string[];
}
