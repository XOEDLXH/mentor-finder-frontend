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
