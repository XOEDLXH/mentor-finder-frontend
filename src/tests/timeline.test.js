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
        expect(screen.getByText("Alice, Bob").closest(".timelineMetaContent")).not.toBeNull();
        expect(container.querySelector(".timelineAbstractContent")).not.toBeNull();
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
