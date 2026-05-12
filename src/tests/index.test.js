import { render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

import HomeScreen from "../pages/index";
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

        const titleLink = await screen.findByRole("link", { name: /Weekly/i });

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

        expect(screen.queryByRole("link", { name: /Weekly/i })).not.toBeInTheDocument();
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
