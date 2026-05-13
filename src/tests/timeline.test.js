import { render, screen, waitFor, within } from "@testing-library/react";
import { useRouter } from "next/router";

import { request } from "../utils/network";
import TimelinePage from "../pages/timeline";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
}));

describe("TimelinePage LaTeX rendering", () => {
    const mockPush = jest.fn();

    beforeEach(() => {
        mockPush.mockReset();
        request.mockReset();
        useRouter.mockReturnValue({
            push: mockPush,
        });
    });

    const mockTimelineApis = ({ summaryText }) => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return {
                    directions: [
                        { direction: "机器学习", paper_count: 1 },
                    ],
                    default_direction: "机器学习",
                    page_size_default: 20,
                    page_size_max: 100,
                };
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&page=1&page_size=20") {
                return {
                    direction: "机器学习",
                    page: 1,
                    page_size: 20,
                    total_papers: 1,
                    total_pages: 1,
                    has_previous: false,
                    has_next: false,
                    papers: [
                        {
                            id: 1,
                            title: "Compression Paper",
                            abstract: summaryText,
                            tldr: "",
                            arxiv_url: "https://arxiv.org/abs/1234.5678",
                            publish_date: "2026-05-01",
                            author_names: "Alice, Bob",
                            mentor_ids: [1, 0],
                            subjects: "cs.LG",
                        },
                    ],
                };
            }

            return {};
        });
    };

    const mockTimelinePaperApi = (paperOverrides = {}) => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return {
                    directions: [
                        { direction: "机器学习", paper_count: 1 },
                    ],
                    default_direction: "机器学习",
                    page_size_default: 20,
                    page_size_max: 100,
                };
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&page=1&page_size=20") {
                return {
                    direction: "机器学习",
                    page: 1,
                    page_size: 20,
                    total_papers: 1,
                    total_pages: 1,
                    has_previous: false,
                    has_next: false,
                    papers: [
                        {
                            id: 1,
                            title: "Compression Paper",
                            abstract: "普通摘要。",
                            tldr: "",
                            arxiv_url: "https://arxiv.org/abs/1234.5678",
                            publish_date: "2026-05-01",
                            author_names: "Alice, Bob",
                            mentor_ids: [1, 0],
                            subjects: "cs.LG",
                            ...paperOverrides,
                        },
                    ],
                };
            }

            return {};
        });
    };

    it("renders inline LaTeX in timeline abstracts", async () => {
        mockTimelineApis({
            summaryText: "sequence length, but performing semantic-level compression through a specific ratio $k$}. This $O(n/k)$ bound remains effective.",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        expect(screen.getByText(/sequence length, but performing semantic-level compression through a specific ratio/i)).toBeInTheDocument();
        expect(screen.getByText(/This/i)).toBeInTheDocument();
        expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText(/\$k\$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\$O\(n\/k\)\$/)).not.toBeInTheDocument();
    });

    it("renders inline LaTeX in timeline titles and exposes arXiv/pdf links next to the date", async () => {
        mockTimelinePaperApi({
            title: "Compression $x^2$ Paper",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByText(/Compression/i);

        const titleHeading = container.querySelector("h4");
        const arxivLink = screen.getByRole("link", { name: "arxiv" });
        const pdfLink = screen.getByRole("link", { name: "pdf" });
        const headerRow = container.querySelector(".timelinePaperHeaderRow");
        const paperLinks = container.querySelector(".timelinePaperLinks");
        expect(titleHeading?.querySelector("a[href]")).toBeNull();
        expect(arxivLink).toHaveAttribute("href", "https://arxiv.org/abs/1234.5678");
        expect(pdfLink).toHaveAttribute("href", "https://arxiv.org/pdf/1234.5678");
        expect(headerRow?.contains(paperLinks)).toBe(true);
        expect(titleHeading?.querySelector(".katex")).not.toBeNull();
        expect(screen.queryByText(/\$x\^2\$/)).not.toBeInTheDocument();
    });

    it("renders split subject tags in the timeline header row", async () => {
        mockTimelinePaperApi({
            subjects: "cs.CR, cs.DB",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByText(/Compression/i);

        const headerRow = container.querySelector(".timelinePaperHeaderRow");
        const subjectTags = container.querySelector(".timelineSubjectTags");
        expect(headerRow?.contains(subjectTags)).toBe(true);
        expect(screen.getByText("cs.CR")).toBeInTheDocument();
        expect(screen.getByText("cs.DB")).toBeInTheDocument();
    });

    it("renders block-delimited LaTeX inline in timeline titles", async () => {
        mockTimelinePaperApi({
            title: "Compression $$E=mc^2$$ Paper",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByText(/Compression/i);

        const titleHeading = container.querySelector("h4");
        const arxivLink = screen.getByRole("link", { name: "arxiv" });
        const pdfLink = screen.getByRole("link", { name: "pdf" });
        expect(titleHeading?.querySelector("a[href]")).toBeNull();
        expect(arxivLink).toHaveAttribute("href", "https://arxiv.org/abs/1234.5678");
        expect(pdfLink).toHaveAttribute("href", "https://arxiv.org/pdf/1234.5678");
        expect(titleHeading?.querySelector(".katex")).not.toBeNull();
        expect(titleHeading?.querySelector(".latexTextDisplay")).toBeNull();
        expect(screen.queryByText(/\$\$E=mc\^2\$\$/)).not.toBeInTheDocument();
    });

    it("renders LaTeX in timeline titles without external link row when arXiv is missing", async () => {
        mockTimelinePaperApi({
            title: "Compression \\(x^2\\) Paper",
            arxiv_url: undefined,
        });

        const { container } = render(<TimelinePage />);

        await screen.findByText(/Compression/i);

        const titleHeading = container.querySelector("h4");
        expect(screen.queryByRole("link", { name: "arxiv" })).toBeNull();
        expect(screen.queryByRole("link", { name: "pdf" })).toBeNull();
        expect(screen.queryByLabelText("论文外部链接")).toBeNull();
        expect(titleHeading?.querySelector(".katex")).not.toBeNull();
        expect(screen.queryByText(/\\\(x\^2\\\)/)).not.toBeInTheDocument();
    });

    it("does not render subject tags when timeline paper subjects are missing", async () => {
        mockTimelinePaperApi({
            subjects: "",
        });

        render(<TimelinePage />);

        await screen.findByText(/Compression/i);

        expect(screen.queryByLabelText("论文学科分类")).toBeNull();
    });

    it("renders author and abstract rows with the shared aligned layout", async () => {
        mockTimelineApis({
            summaryText: "普通摘要 $x$。",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        const metaRows = container.querySelectorAll(".timelineMetaRow");
        expect(metaRows.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText("作者：").closest(".timelineMetaRow")).not.toBeNull();
        expect(screen.getByText("摘要：").closest(".timelineMetaRow")).not.toBeNull();
        expect(screen.getByRole("link", { name: "Alice" }).closest(".timelineMetaContent")).not.toBeNull();
        expect(screen.getByText("Bob").closest(".timelineMetaContent")).not.toBeNull();
        expect(container.querySelector(".timelineAbstractContent")).not.toBeNull();
    });

    it("renders mentor authors as links to mentor detail and keeps unmatched authors plain", async () => {
        mockTimelinePaperApi({
            author_names: "李四,赵云",
            mentor_ids: [5, 0],
        });

        render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        const mentorLink = screen.getByRole("link", { name: "李四" });
        expect(mentorLink).toHaveAttribute("href", "/mentors/5");
        expect(screen.getByText("赵云")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "赵云" })).toBeNull();
    });

    it("falls back to plain text authors when mentor_ids are missing", async () => {
        mockTimelinePaperApi({
            author_names: "李四,赵云",
            mentor_ids: undefined,
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        const authorRow = container.querySelector(".timelineMetaContent");
        expect(authorRow).not.toBeNull();
        expect(authorRow?.textContent).toContain("李四");
        expect(authorRow?.textContent).toContain("赵云");
        expect(screen.queryByRole("link", { name: "李四" })).toBeNull();
        expect(screen.queryByRole("link", { name: "赵云" })).toBeNull();
    });

    it("renders block LaTeX in timeline abstracts", async () => {
        mockTimelineApis({
            summaryText: "核心结论如下：$$E=mc^2$$并且后续仍成立。",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        const abstractContainer = container.querySelector(".timelineAbstractContent");
        expect(abstractContainer).not.toBeNull();
        expect(abstractContainer.querySelector(".latexTextDisplay")).not.toBeNull();
        expect(container.querySelector(".katex-display")).not.toBeNull();
    });

    it("keeps plain abstracts unchanged when no LaTeX is present", async () => {
        mockTimelineApis({
            summaryText: "这是一个没有任何公式的普通摘要。",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        const article = screen.getByRole("heading", { name: "Compression Paper" }).closest("article");
        expect(within(article).getByText("这是一个没有任何公式的普通摘要。")).toBeInTheDocument();
        expect(container.querySelector(".katex")).toBeNull();
    });

    it("falls back safely when delimiters are unclosed or formula content is invalid", async () => {
        mockTimelineApis({
            summaryText: "未闭合公式 $k 和非法公式 \\badcommand{ 都应该继续显示。",
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        expect(screen.getByText("未闭合公式 $k 和非法公式 \\badcommand{ 都应该继续显示。")).toBeInTheDocument();
        expect(container.querySelectorAll(".katex").length).toBe(0);
    });

    it("uses tldr before abstract when rendering summary content", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return {
                    directions: [
                        { direction: "机器学习", paper_count: 1 },
                    ],
                    default_direction: "机器学习",
                    page_size_default: 20,
                    page_size_max: 100,
                };
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&page=1&page_size=20") {
                return {
                    direction: "机器学习",
                    page: 1,
                    page_size: 20,
                    total_papers: 1,
                    total_pages: 1,
                    has_previous: false,
                    has_next: false,
                    papers: [
                        {
                            id: 1,
                            title: "Compression Paper",
                            abstract: "abstract $x$",
                            tldr: "tldr $y$",
                            arxiv_url: "https://arxiv.org/abs/1234.5678",
                            publish_date: "2026-05-01",
                            author_names: "Alice, Bob",
                        },
                    ],
                };
            }

            return {};
        });

        const { container } = render(<TimelinePage />);

        await screen.findByRole("heading", { name: "Compression Paper" });

        expect(screen.getByText(/tldr/i)).toBeInTheDocument();
        expect(screen.queryByText(/abstract/i)).not.toBeInTheDocument();
        await waitFor(() => {
            expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
        });
    });
});
