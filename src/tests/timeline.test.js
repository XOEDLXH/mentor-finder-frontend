import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const createPaper = (id, overrides = {}) => ({
        id,
        title: `Compression Paper ${id}`,
        abstract: "普通摘要。",
        tldr: "",
        arxiv_url: "https://arxiv.org/abs/1234.5678",
        publish_date: `2026-05-${String((id % 28) + 1).padStart(2, "0")}`,
        author_names: "Alice, Bob",
        mentor_ids: [1, 0],
        subjects: "cs.LG",
        ...overrides,
    });
    const timelineResponse = (papers, overrides = {}) => ({
        direction: "机器学习",
        offset: 0,
        limit: 6,
        total_papers: papers.length,
        has_previous: false,
        has_next: false,
        papers,
        ...overrides,
    });
    const createDeferred = () => {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };

    beforeEach(() => {
        mockPush.mockReset();
        request.mockReset();
        Object.defineProperty(window, "scrollY", {
            configurable: true,
            writable: true,
            value: 0,
        });
        window.scrollBy = jest.fn();
        window.scrollTo = jest.fn();
        Element.prototype.scrollIntoView = jest.fn();
        useRouter.mockReturnValue({
            push: mockPush,
        });
    });

    const mockTimelineOverview = (overrides = {}) => ({
        directions: [
            { direction: "机器学习", paper_count: 30 },
            { direction: "自然语言处理", paper_count: 8 },
        ],
        default_direction: "机器学习",
        page_size_default: 20,
        page_size_max: 100,
        ...overrides,
    });

    const mockTimelineApis = ({ summaryText }) => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return timelineResponse([
                    createPaper(1, {
                        title: "Compression Paper",
                        abstract: summaryText,
                    }),
                ], {
                    total_papers: 1,
                    limit: 6,
                });
            }

            return {};
        });
    };

    const mockTimelinePaperApi = (paperOverrides = {}) => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return timelineResponse([
                    createPaper(1, {
                        title: "Compression Paper",
                        ...paperOverrides,
                    }),
                ], {
                    total_papers: 1,
                    limit: 6,
                });
            }

            return {};
        });
    };

    const simulateViewportScroll = (scrollTop) => {
        const viewport = screen.getByTestId("timeline-feed-viewport");
        Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            writable: true,
            value: scrollTop,
        });
        Object.defineProperty(viewport, "clientHeight", {
            configurable: true,
            value: 400,
        });
        Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            value: 1200,
        });
        act(() => {
            fireEvent.scroll(viewport);
        });
    };

    it("loads the first 6 papers via offset-limit and removes old pagination controls", async () => {
        const firstBatch = Array.from({ length: 6 }, (_, idx) => createPaper(idx + 1));
        const initialDeferred = createDeferred();
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return initialDeferred.promise;
            }

            return {};
        });

        render(<TimelinePage />);

        expect(await screen.findByTestId("timeline-feed-preview-skeletons")).toBeInTheDocument();
        await act(async () => {
            initialDeferred.resolve(timelineResponse(firstBatch, {
                total_papers: 30,
                has_next: true,
            }));
        });
        await screen.findByRole("heading", { name: "Compression Paper 1" });

        expect(request).toHaveBeenCalledWith("/api/timeline", "GET", false);
        expect(request).toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6", "GET", false);
        expect(screen.queryByRole("button", { name: "首页" })).toBeNull();
        expect(screen.getByText("当前显示第 1-6 篇")).toBeInTheDocument();
    });

    it("renders the timeline shell skeletons before directions and papers resolve", async () => {
        const overviewDeferred = createDeferred();
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return overviewDeferred.promise;
            }

            return {};
        });

        render(<TimelinePage />);

        expect(screen.getByText("论文时间线")).toBeInTheDocument();
        expect(screen.getByTestId("timeline-direction-skeletons")).toBeInTheDocument();
        expect(screen.getByTestId("timeline-feed-header-skeleton")).toBeInTheDocument();
        expect(screen.getByTestId("timeline-feed-preview-skeletons")).toBeInTheDocument();
        expect(screen.queryByText("当前研究方向下暂无论文数据。")).toBeNull();

        await act(async () => {
            overviewDeferred.resolve(mockTimelineOverview());
        });

        await screen.findByRole("button", { name: /机器学习/ });
    });

    it("removes the shell skeletons after the first feed batch resolves", async () => {
        const initialDeferred = createDeferred();
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return initialDeferred.promise;
            }

            return {};
        });

        render(<TimelinePage />);

        expect(await screen.findByTestId("timeline-feed-header-skeleton")).toBeInTheDocument();
        expect(await screen.findByTestId("timeline-feed-preview-skeletons")).toBeInTheDocument();

        await act(async () => {
            initialDeferred.resolve(timelineResponse([
                createPaper(1, { title: "Compression Paper" }),
            ], {
                total_papers: 1,
                limit: 6,
            }));
        });

        await screen.findByRole("heading", { name: "Compression Paper" });
        await waitFor(() => {
            expect(screen.queryByTestId("timeline-feed-header-skeleton")).toBeNull();
            expect(screen.queryByTestId("timeline-feed-preview-skeletons")).toBeNull();
        });
        expect(screen.queryByText("当前研究方向下暂无论文数据。")).toBeNull();
    });

    it("loads the previous 5 papers immediately after the user scrolls upward to the top of the feed viewport", async () => {
        const firstBatch = Array.from({ length: 6 }, (_, idx) => createPaper(idx + 6));
        const previousBatch = Array.from({ length: 5 }, (_, idx) => createPaper(idx + 1));
        const previousDeferred = createDeferred();
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview({
                    default_direction: "自然语言处理",
                });
            }

            if (url === "/api/timeline?direction=%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86&offset=0&limit=6") {
                return {
                    direction: "自然语言处理",
                    offset: 0,
                    limit: 6,
                    total_papers: 8,
                    has_previous: false,
                    has_next: true,
                    papers: Array.from({ length: 6 }, (_, idx) => createPaper(idx + 31, {
                        title: `NLP Paper ${idx + 1}`,
                    })),
                };
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return timelineResponse(firstBatch, {
                    offset: 5,
                    limit: 6,
                    total_papers: 30,
                    has_previous: true,
                    has_next: true,
                });
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=5") {
                return previousDeferred.promise;
            }

            return {};
        });

        render(<TimelinePage />);
        await screen.findByRole("heading", { name: "NLP Paper 1" });
        fireEvent.click(screen.getByRole("button", { name: /机器学习/ }));
        await screen.findByRole("heading", { name: /Compression Paper 6/ });

        simulateViewportScroll(200);
        simulateViewportScroll(50);
        expect(screen.queryByTestId("timeline-skeleton-top")).toBeNull();

        simulateViewportScroll(0);
        expect(screen.getByTestId("timeline-skeleton-top")).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=5", "GET", false);
        await act(async () => {
            previousDeferred.resolve(timelineResponse(previousBatch, {
                offset: 0,
                limit: 5,
                total_papers: 30,
                has_previous: false,
                has_next: true,
            }));
        });
        await screen.findByRole("heading", { name: "Compression Paper 1" });
    });

    it("does not load the previous batch when the feed viewport returns to the top programmatically", async () => {
        const firstBatch = Array.from({ length: 6 }, (_, idx) => createPaper(idx + 6));
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return timelineResponse(firstBatch, {
                    offset: 5,
                    limit: 6,
                    total_papers: 30,
                    has_previous: true,
                    has_next: true,
                });
            }

            return {};
        });

        render(<TimelinePage />);
        await screen.findByRole("heading", { name: /Compression Paper 6/ });

        simulateViewportScroll(200);
        const viewport = screen.getByTestId("timeline-feed-viewport");

        fireEvent.click(screen.getByRole("button", { name: /机器学习/ }));

        Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            writable: true,
            value: 0,
        });
        act(() => {
            fireEvent.scroll(viewport);
        });

        expect(request).not.toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=5", "GET", false);
        expect(screen.queryByTestId("timeline-skeleton-top")).toBeNull();
    });

    it("applies only a partial scroll adjustment after appending the next batch", async () => {
        const firstBatch = Array.from({ length: 6 }, (_, idx) => createPaper(idx + 1));
        const nextBatch = Array.from({ length: 5 }, (_, idx) => createPaper(idx + 7));

        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=0&limit=6") {
                return timelineResponse(firstBatch, {
                    offset: 0,
                    limit: 6,
                    total_papers: 30,
                    has_next: true,
                });
            }

            if (url === "/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=6&limit=5") {
                return timelineResponse(nextBatch, {
                    offset: 6,
                    limit: 5,
                    total_papers: 30,
                    has_previous: true,
                    has_next: true,
                });
            }

            return {};
        });

        render(<TimelinePage />);
        await screen.findByRole("heading", { name: "Compression Paper 1" });

        const viewport = screen.getByTestId("timeline-feed-viewport");
        Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            writable: true,
            value: 200,
        });
        Object.defineProperty(viewport, "getBoundingClientRect", {
            configurable: true,
            value: () => ({
                top: 0,
                bottom: 400,
                left: 0,
                right: 0,
                width: 400,
                height: 400,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });

        const lastCurrentPaper = screen.getByTestId("timeline-paper-6");
        Object.defineProperty(lastCurrentPaper, "offsetTop", {
            configurable: true,
            value: 900,
        });

        const preview = screen.getByTestId("timeline-feed-load-more-preview");
        const firstPreviewCard = preview.querySelector("[data-load-more-preview-first='true']");
        expect(firstPreviewCard).not.toBeNull();
        Object.defineProperty(firstPreviewCard, "getBoundingClientRect", {
            configurable: true,
            value: () => ({
                top: 350,
                bottom: 520,
                left: 0,
                right: 0,
                width: 400,
                height: 170,
                x: 0,
                y: 350,
                toJSON: () => ({}),
            }),
        });

        act(() => {
            fireEvent.scroll(viewport);
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&offset=6&limit=5", "GET", false);
        });
        expect(await screen.findByTestId("timeline-paper-7")).toBeInTheDocument();
    });


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

        const preview = screen.getByTestId("timeline-feed-load-more-preview");
        const firstPreviewCard = preview.querySelector("[data-load-more-preview-first='true']");
        Object.defineProperty(firstPreviewCard, "getBoundingClientRect", {
            configurable: true,
            value: () => ({
                top: 350,
                bottom: 520,
                left: 0,
                right: 0,
                width: 400,
                height: 170,
                x: 0,
                y: 350,
                toJSON: () => ({}),
            }),
        });

        act(() => {
            fireEvent.scroll(viewport);
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&before_date=2026-05-10&before_id=2&limit=5", "GET", false);
        });
        expect(await screen.findByRole("heading", { name: "Older Paper 3" })).toBeInTheDocument();
    });

    it("loads newer papers only after top overscroll wheel intent at the viewport top", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "calendar=1"])) {
                return mockCalendarMeta();
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "date=2026-05-10", "limit=6"])) {
                return timelineResponse([
                    createPaper(9, {
                        title: "Current Day Paper",
                        publish_date: "2026-05-10",
                        day_sequence: 1,
                        day_total: 1,
                    }),
                ], {
                    total_papers: 18,
                    has_newer: true,
                    has_older: true,
                });
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "after_date=2026-05-10", "after_id=9", "limit=5"])) {
                return timelineResponse([
                    createPaper(8, {
                        title: "Newer Paper 1",
                        publish_date: "2026-05-11",
                        day_sequence: 1,
                        day_total: 2,
                    }),
                    createPaper(7, {
                        title: "Newer Paper 2",
                        publish_date: "2026-05-11",
                        day_sequence: 2,
                        day_total: 2,
                    }),
                ], {
                    total_papers: 18,
                    has_newer: false,
                    has_older: true,
                });
            }
            return {};
        });

        render(<TimelinePage />);
        await screen.findByRole("heading", { name: "Current Day Paper" });

        const viewport = setupViewportGeometry();
        setViewportScrollTop(viewport, 0);
        setPaperGeometry(9, 0);

        act(() => {
            fireEvent.wheel(viewport, { deltaY: -20 });
        });
        expect(request).not.toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&after_date=2026-05-10&after_id=9&limit=5", "GET", false);

        act(() => {
            fireEvent.wheel(viewport, { deltaY: -80 });
        });

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith("/api/timeline?direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0&after_date=2026-05-10&after_id=9&limit=5", "GET", false);
        });
        expect(screen.queryByTestId("timeline-paper-8")).toBeNull();
    });

    it("updates the visible date range based on the first visible paper in the viewport", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "calendar=1"])) {
                return mockCalendarMeta();
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "date=2026-05-10", "limit=6"])) {
                return timelineResponse([
                    createPaper(1, { publish_date: "2026-05-10", day_sequence: 1, day_total: 2 }),
                    createPaper(2, { publish_date: "2026-05-10", day_sequence: 2, day_total: 2 }),
                    createPaper(3, { publish_date: "2026-05-09", day_sequence: 1, day_total: 1 }),
                ], {
                    total_papers: 18,
                    has_older: true,
                });
            }
            return {};
        });

        render(<TimelinePage />);
        await screen.findByRole("heading", { name: "Compression Paper 1" });

        const viewport = setupViewportGeometry();
        setPaperGeometry(1, 0, 120);
        setPaperGeometry(2, 130, 120);
        setPaperGeometry(3, 360, 120);

        expect(screen.getByText((content) => content.includes("当前显示 2026-05-10"))).toBeInTheDocument();

        setViewportScrollTop(viewport, 260);
        act(() => {
            fireEvent.scroll(viewport);
        });

        await waitFor(() => {
            expect(screen.getByText((content) => content.includes("当前显示 2026-05-09"))).toBeInTheDocument();
        });
    });

    it("renders inline LaTeX in titles and mentor links in author rows", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/timeline") {
                return mockTimelineOverview();
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "calendar=1"])) {
                return mockCalendarMeta();
            }
            if (isTimelineUrl(url, ["direction=%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0", "date=2026-05-10", "limit=6"])) {
                return timelineResponse([
                    createPaper(1, {
                        title: "Compression $x^2$ Paper",
                        author_names: "李四,赵云",
                        mentor_ids: [5, 0],
                        abstract: "摘要中有公式 $k$。",
                        day_sequence: 1,
                        day_total: 1,
                    }),
                ], {
                    total_papers: 1,
                });
            }
            return {};
        });

        const { container } = render(<TimelinePage />);

        await screen.findByText(/Compression/i);

        const titleHeading = container.querySelector("h4");
        expect(titleHeading?.querySelector(".katex")).not.toBeNull();
        expect(screen.queryByText(/\$x\^2\$/)).not.toBeInTheDocument();

        const mentorLink = screen.getByRole("link", { name: /李四/ });
        expect(mentorLink).toHaveAttribute("href", "/mentors/5");
        expect(within(mentorLink).getByAltText("清华导师")).toHaveAttribute("src", "/favicon_tsinghua.ico");
        expect(screen.getByText("赵云")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "赵云" })).toBeNull();
    });
});
