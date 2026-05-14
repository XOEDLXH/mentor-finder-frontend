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

export interface MentorDetail {
    id: number;
    Chinese_name: string;
    English_name?: string;
    research_direction: string;
    email?: string;
    profile?: string;
    is_private: boolean;
    paper_ids: PrivateMentorPaper[];
}

export interface MentorRecentDirectionAnalysisPaper {
    id: number;
    title: string;
    publish_date: string;
}

export interface MentorRecentDirectionAnalysisResponse {
    mentorId: number;
    mentorName: string;
    paperCount: number;
    generatedBy: string;
    analysis: string;
    papers: MentorRecentDirectionAnalysisPaper[];
}

export interface SearchPaperResult {
    id: number;
    title: string;
    abstract?: string;
    publish_date?: string;
    author_names: string;
    subjects: string;
    arxiv_id?: string;
    arxiv_url?: string;
    mentorNames: string[];
    mentor_ids?: number[];
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
    mentor_ids?: number[];
    subjects?: string;
}

export interface TimelineGroup {
    direction: string;
    papers: TimelinePaper[];
}

export interface TimelineDirectionSummary {
    direction: string;
    paper_count: number;
}

export interface TimelineDirectionsResponse {
    directions: TimelineDirectionSummary[];
    default_direction: string;
    page_size_default: number;
    page_size_max: number;
}

export interface WeeklyPushPaper {
    id: number;
    title: string;
    publishDate?: string;
    authorNames: string;
    arxivUrl?: string;
    arxivId?: string;
    abstract?: string;
    tldr?: string;
}

export interface WeeklyPushItem {
    weekStart: string;
    weekEnd: string;
    paperCount: number;
    title: string;
    fixedSummary: string;
    aiSummary: string;
    content: string;
    papers: WeeklyPushPaper[];
    generatedBy: string;
    updatedAt: string;
}

export interface WeeklyPushResponse {
    weeklyPush?: WeeklyPushItem;
}

export interface WeeklyPushHistoryItem {
    weekStart: string;
    weekEnd: string;
    title: string;
    paperCount: number;
    generatedBy: string;
    updatedAt: string;
}

export interface WeeklyPushHistoryResponse {
    history: WeeklyPushHistoryItem[];
}

export interface TimelinePapersResponse {
    direction: string;
    page: number;
    page_size: number;
    total_papers: number;
    total_pages: number;
    has_previous: boolean;
    has_next: boolean;
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
