export interface SearchMentorResult {
    id: number;
    Chinese_name: string;
    English_name?: string;
    research_direction: string;
    email?: string;
    profile?: string;
    paperTitles: string[];
    name?: string;
    researchDirection?: string;
}

export interface SearchPaperResult {
    id: number;
    title: string;
    abstract?: string;
    publish_date?: string;
    author_names: string;
    mentorNames: string[];
    publishDate?: string;
}
