import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

import HomeScreen, { WeeklyPushDetailCard } from "../pages/index";
import authReducer from "../redux/auth";
import { request } from "../utils/network";

jest.mock("../utils/network", () => ({
    request: jest.fn(),
}));

describe("HomeScreen weekly paper abstracts", () => {
    const buildWeeklyPush = (paperOverrides = {}) => ({
        weekStart: "2026-05-01",
        weekEnd: "2026-05-07",
        paperCount: 1,
        title: "本周论文速递",
        fixedSummary: "",
        aiSummary: "",
        content: "本周周报正文保持纯文本。",
        generatedBy: "rule",
        updatedAt: "2026-05-12 12:00:00",
        papers: [{
            id: 1,
            title: "Weekly Paper",
            publishDate: "2026-05-01",
            authorNames: "Alice, Bob",
            arxivUrl: "https://arxiv.org/abs/2501.00001",
            arxivId: "2501.00001",
            abstract: "默认摘要",
            tldr: "",
            ...paperOverrides,
        }],
    });

    const renderWithStore = (name = "") => {
        const store = configureStore({
            reducer: {
                auth: authReducer,
            },
            preloadedState: {
                auth: {
                    name,
                    token: "",
                    role: "",
                },
            },
        });

        return render(
            <Provider store={store}>
                <HomeScreen />
            </Provider>,
        );
    };

    beforeEach(() => {
        request.mockReset();
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/weekly-push/latest") {
                return {
                    weeklyPush: buildWeeklyPush(),
                };
            }

            if (url === "/api/dataset/weekly-push/history") {
                return {
                    history: [{
                        weekStart: "2026-05-01",
                        weekEnd: "2026-05-07",
                        title: "本周论文速递",
                        paperCount: 1,
                        generatedBy: "rule",
                        updatedAt: "2026-05-12 12:00:00",
                    }],
                };
            }

            if (url === "/api/dataset/weekly-push/latest?week_start=2026-05-01") {
                return {
                    weeklyPush: buildWeeklyPush(),
                };
            }

            return {};
        });
    });

    it("renders plain weekly paper abstracts unchanged when no LaTeX is present", async () => {
        const { container } = renderWithStore();

        await screen.findByText("本周论文");

        expect(screen.getByText("默认摘要")).toBeInTheDocument();
        expect(container.querySelector(".homeWeeklyPaperAbstractContent")).not.toBeNull();
        expect(container.querySelector(".katex")).toBeNull();
    });

    it("renders inline LaTeX in weekly paper abstracts", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/weekly-push/latest") {
                return {
                    weeklyPush: buildWeeklyPush({
                        abstract: "sequence length, but performing semantic-level compression through a specific ratio $k$}. This $O(n/k)$ path remains effective.",
                    }),
                };
            }

            if (url === "/api/dataset/weekly-push/history") {
                return {
                    history: [],
                };
            }

            return {};
        });

        const { container } = renderWithStore();

        await screen.findByRole("link", { name: "Weekly Paper" });

        expect(screen.getByText(/sequence length, but performing semantic-level compression through a specific ratio/i)).toBeInTheDocument();
        expect(screen.getByText(/This/i)).toBeInTheDocument();
        expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText(/\$k\$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\$O\(n\/k\)\$/)).not.toBeInTheDocument();
    });

    it("renders LaTeX in weekly paper titles while keeping the arXiv link", async () => {
        const weeklyPushWithLatexTitle = buildWeeklyPush({
            title: "Weekly $x^2$ Paper",
        });

        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/weekly-push/latest" || url === "/api/dataset/weekly-push/latest?week_start=2026-05-01") {
                return {
                    weeklyPush: weeklyPushWithLatexTitle,
                };
            }

            if (url === "/api/dataset/weekly-push/history") {
                return {
                    history: [],
                };
            }

            return {};
        });

        const { container } = renderWithStore();

        await screen.findByText(/Weekly/i);

        const titleLink = container.querySelector("a[href='https://arxiv.org/abs/2501.00001']");
        expect(titleLink).toHaveAttribute("href", "https://arxiv.org/abs/2501.00001");
        expect(container.querySelector(".katex")).not.toBeNull();
        expect(screen.queryByText(/\$x\^2\$/)).not.toBeInTheDocument();
    });

    it("renders LaTeX in weekly paper titles without arXiv links", async () => {
        const weeklyPushWithLatexTitle = buildWeeklyPush({
            title: "Weekly $$x^2$$ Paper",
            arxivUrl: undefined,
        });

        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/weekly-push/latest" || url === "/api/dataset/weekly-push/latest?week_start=2026-05-01") {
                return {
                    weeklyPush: weeklyPushWithLatexTitle,
                };
            }

            if (url === "/api/dataset/weekly-push/history") {
                return {
                    history: [],
                };
            }

            return {};
        });

        const { container } = renderWithStore();

        await screen.findByText("本周论文");

        expect(container.querySelector("a[href]")).toBeNull();
        expect(screen.getByText(/Weekly/i)).toBeInTheDocument();
        expect(container.querySelector(".katex")).not.toBeNull();
        expect(container.querySelector(".latexTextDisplay")).toBeNull();
        expect(screen.queryByText(/\$\$x\^2\$\$/)).not.toBeInTheDocument();
    });

    it("renders block LaTeX in weekly paper abstracts", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/weekly-push/latest") {
                return {
                    weeklyPush: buildWeeklyPush({
                        abstract: "核心结论如下：$$E=mc^2$$并且后续仍成立。",
                    }),
                };
            }

            if (url === "/api/dataset/weekly-push/history") {
                return {
                    history: [],
                };
            }

            return {};
        });

        const { container } = renderWithStore();

        await screen.findByRole("link", { name: "Weekly Paper" });

        expect(container.querySelector(".homeWeeklyPaperAbstractContent .latexTextDisplay")).not.toBeNull();
        expect(container.querySelector(".katex-display")).not.toBeNull();
    });

    it("uses tldr before abstract in weekly paper abstracts", async () => {
        request.mockImplementation(async (url) => {
            if (url === "/api/dataset/weekly-push/latest") {
                return {
                    weeklyPush: buildWeeklyPush({
                        abstract: "abstract $x$",
                        tldr: "tldr $y$",
                    }),
                };
            }

            if (url === "/api/dataset/weekly-push/history") {
                return {
                    history: [],
                };
            }

            return {};
        });

        const { container } = renderWithStore();

        await screen.findByRole("link", { name: "Weekly Paper" });

        expect(screen.getByText(/tldr/i)).toBeInTheDocument();
        expect(screen.queryByText(/abstract/i)).not.toBeInTheDocument();
        await waitFor(() => {
            expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
        });
    });
});

describe("HomeScreen subject group interactions", () => {
    const buildPersonalizedWeeklyPush = () => ({
        weekStart: "2026-05-01",
        weekEnd: "2026-05-07",
        paperCount: 2,
        title: "个性周报",
        fixedSummary: "规则摘要",
        aiSummary: "AI 摘要",
        content: "个性周报正文",
        generatedBy: "thucs-openai",
        updatedAt: "2026-05-12 12:00:00",
        papers: [{
            id: 11,
            title: "Mentor weekly paper",
            publishDate: "2026-05-01",
            authorNames: "Alice",
            abstract: "导师论文摘要",
            tldr: "",
            mentorNames: ["张老师"],
        }],
        mentorGroups: [],
        subjectGroups: [
            {
                subject: "cs.AI",
                paperCount: 2,
                papers: [
                    {
                        id: 101,
                        title: "AI Paper One",
                        publishDate: "2026-05-03",
                        authorNames: "Alice, Bob",
                        subject: "cs.AI",
                        subjects: ["cs.AI", "cs.LG"],
                        abstractPreview: "AI Paper One 摘要预览",
                    },
                    {
                        id: 102,
                        title: "AI Paper Two",
                        publishDate: "2026-05-04",
                        authorNames: "Carol",
                        subject: "cs.AI",
                        subjects: ["cs.AI"],
                        abstractPreview: "AI Paper Two 摘要预览",
                    },
                ],
            },
            {
                subject: "cs.CL",
                paperCount: 1,
                papers: [
                    {
                        id: 103,
                        title: "CL Paper One",
                        publishDate: "2026-05-05",
                        authorNames: "Dave",
                        subject: "cs.CL",
                        subjects: ["cs.CL"],
                        abstractPreview: "CL Paper One 摘要预览",
                    },
                ],
            },
        ],
        subjectDistribution: [{ subject: "cs.AI", count: 2 }, { subject: "cs.CL", count: 1 }],
        trackedMentorCount: 1,
        activeMentorCount: 1,
        trackedSubjectCount: 2,
        activeSubjectCount: 2,
    });

    const renderSubjectGroups = (pushOverrides = {}) => render(
        <WeeklyPushDetailCard
            push={{
                ...buildPersonalizedWeeklyPush(),
                ...pushOverrides,
            }}
            emptyPaperText="你关注的导师本周暂无新增论文明细。"
            showMentorNames
            showPersonalizedSummary
            metaItems={[]}
        />,
    );

    it("renders horizontal subject cards and opens the selected subject modal", async () => {
        const user = userEvent.setup();
        renderSubjectGroups();

        const aiCardButton = await screen.findByRole("button", { name: "查看板块 cs.AI 的 2 篇论文" });
        expect(aiCardButton).toBeInTheDocument();
        expect(within(aiCardButton).getByText("cs.AI")).toBeInTheDocument();
        expect(within(aiCardButton).getByText("人工智能 (Artificial Intelligence)")).toBeInTheDocument();
        expect(within(aiCardButton).getByText("2篇")).toBeInTheDocument();
        expect(screen.queryByText("AI Paper One 摘要预览")).not.toBeInTheDocument();
        expect(screen.queryByText("AI Paper One")).not.toBeInTheDocument();

        await user.click(aiCardButton);

        const dialog = await screen.findByRole("dialog", { name: "人工智能 (Artificial Intelligence)" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("cs.AI")).toBeInTheDocument();
        expect(within(dialog).getByText("人工智能 (Artificial Intelligence)")).toBeInTheDocument();
        expect(within(dialog).getByText("AI Paper One")).toBeInTheDocument();
        expect(within(dialog).getByText("AI Paper Two")).toBeInTheDocument();
        expect(within(dialog).getByText("AI Paper One 摘要预览")).toBeInTheDocument();
        expect(within(dialog).getByText(/作者：Alice, Bob/)).toBeInTheDocument();
        expect(document.body.style.overflow).toBe("hidden");

        await user.click(screen.getByRole("button", { name: "关闭 cs.AI 板块详情" }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "人工智能 (Artificial Intelligence)" })).not.toBeInTheDocument();
        });
        expect(document.body.style.overflow).toBe("");
    });

    it("closes the subject modal via overlay click and Escape key", async () => {
        const user = userEvent.setup();
        renderSubjectGroups();

        await user.click(await screen.findByRole("button", { name: "查看板块 cs.CL 的 1 篇论文" }));

        const dialog = await screen.findByRole("dialog", { name: "自然语言处理 (NLP)" });
        const overlay = dialog.parentElement;
        expect(overlay).not.toBeNull();

        fireEvent.click(overlay);
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "自然语言处理 (NLP)" })).not.toBeInTheDocument();
        });

        await user.click(await screen.findByRole("button", { name: "查看板块 cs.CL 的 1 篇论文" }));
        await screen.findByRole("dialog", { name: "自然语言处理 (NLP)" });

        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "自然语言处理 (NLP)" })).not.toBeInTheDocument();
        });
        expect(document.body.style.overflow).toBe("");
    });

    it("keeps the empty placeholder when there are no followed subject updates", async () => {
        renderSubjectGroups({
            subjectGroups: [],
            trackedSubjectCount: 0,
            activeSubjectCount: 0,
        });

        expect(await screen.findByText("你关注的板块本周暂无新增论文。")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /查看板块/ })).not.toBeInTheDocument();
    });
});
