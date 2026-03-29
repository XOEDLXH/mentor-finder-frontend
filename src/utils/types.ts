export type Board = (0 | 1)[][];

/**
 * @note 用于前后端交互的 Board 数据格式
 */
export interface BoardMetaData {
    id: number;
    boardName: string;
    createdAt: number;
    userName: string;
}

export interface SearchMentorResult {
    id: number;
    name: string;
    researchDirection: string;
    email: string | null;
    profile: string | null;
    paperTitles: string[];
}

export interface SearchPaperResult {
    id: number;
    title: string;
    abstract: string | null;
    publishDate: string | null;
    mentorNames: string[];
}
