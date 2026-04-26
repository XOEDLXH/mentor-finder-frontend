export interface SearchMentorResult {
    id: number;
    Chinese_name: string;
    English_name?: string;
    research_direction: string;
    email?: string;
    profile?: string;
    paperTitles: string[];
    is_private?: boolean;
    name?: string;
    researchDirection?: string;
}

export interface PrivateMentorPaper {
    id: number;
    title: string;
    abstract?: string;
    publish_date?: string;
    author_names: string;
}

export interface PrivateMentorResult {
    id: number;
    Chinese_name: string;
    English_name?: string;
    research_direction: string;
    email?: string;
    profile?: string;
    is_private: boolean;
    paper_ids: PrivateMentorPaper[];
}

export interface SearchPaperResult {
    id: number;
    title: string;
    abstract?: string;
    publish_date?: string;
    author_names: string;
    subjects: string;
    mentorNames: string[];
    publishDate?: string;
}

export interface TimelinePaper {
    id: number;
    title: string;
    abstract?: string;
    tldr?: string;
    arxiv_url?: string;
    publish_date?: string;
    author_names: string;
}

export interface TimelineGroup {
    direction: string;
    papers: TimelinePaper[];
}

export interface BoundMentorProfile {
    id: number;
    Chinese_name: string;
    English_name?: string;
    research_direction: string;
    email?: string;
}

export interface AdminUserResult {
    id: number;
    username: string;
    email: string;
    role: string;
    realName?: string;
    mentorProfile?: BoundMentorProfile;
    isBoundToMentor: boolean;
}

export interface MentorVerificationRequestResult {
    id: number;
    userId: number;
    username: string;
    userEmail: string;
    submittedName: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}
