import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useRouter } from "next/router";
import { request } from "../utils/network";
import authReducer from "../redux/auth";
import SearchScreen from "../pages/search";

jest.mock("next/router", () => ({
    useRouter: jest.fn(),
}));

jest.mock("../utils/network", () => ({
    request: jest.fn(),
}));

describe("SearchScreen", () => {
    const mockPush = jest.fn();

    const renderWithStore = (name = "student", role = "student") => {
        const store = configureStore({
            reducer: {
                auth: authReducer,
            },
            preloadedState: {
                auth: {
                    name,
                    token: "mock-token",
                    role,
                },
            },
        });

        render(
            <Provider store={store}>
                <SearchScreen />
            </Provider>,
        );
    };

    beforeEach(() => {
        mockPush.mockReset();
        request.mockReset();

        useRouter.mockReturnValue({
            push: mockPush,
        });
    });

    it("shows admin operation panel only for admin role", () => {
        renderWithStore("alice", "admin");

        expect(screen.getByRole("heading", { name: "管理员操作" })).toBeInTheDocument();
    });

    it("renders mentor results using backend response fields", async () => {
        request.mockResolvedValue({
            mentors: [{
                id: 1,
                Chinese_name: "张三",
                English_name: "Zhang San",
                research_direction: "机器学习",
                email: "zhangsan@example.com",
                profile: "主要研究机器学习与数据挖掘。",
                paperTitles: ["机器学习方法研究", "大语言模型在问答系统中的应用"],
            }],
        });

        renderWithStore();

        fireEvent.change(screen.getByPlaceholderText("输入导师姓名"), {
            target: { value: "张三" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/mentors?keyword=%E5%BC%A0%E4%B8%89",
                "GET",
                false,
            );
        });

        expect(screen.getByRole("heading", { name: "张三" })).toBeInTheDocument();
        expect(screen.getByText("英文名：Zhang San")).toBeInTheDocument();
        expect(screen.getByText("研究方向：机器学习")).toBeInTheDocument();
        expect(screen.getByText("邮箱：zhangsan@example.com")).toBeInTheDocument();
        expect(screen.getByText("导师画像：主要研究机器学习与数据挖掘。")).toBeInTheDocument();
        expect(screen.getByText("机器学习方法研究")).toBeInTheDocument();
        expect(screen.getByText("大语言模型在问答系统中的应用")).toBeInTheDocument();
    });

    it("renders paper results using backend response fields", async () => {
        request.mockResolvedValue({
            papers: [{
                id: 2,
                title: "大语言模型在问答系统中的应用",
                abstract: "本文介绍大语言模型在智能问答中的实践。",
                publish_date: "2024-06-15",
                author_names: "李四,张三",
                mentorNames: ["李四", "张三"],
            }],
        });

        renderWithStore();

        fireEvent.click(screen.getByRole("button", { name: "搜论文" }));
        fireEvent.change(screen.getByPlaceholderText("输入论文题目、研究方向或导师姓名"), {
            target: { value: "李四" },
        });
        fireEvent.click(screen.getByRole("button", { name: "搜索" }));

        await waitFor(() => {
            expect(request).toHaveBeenCalledWith(
                "/api/search/papers?keyword=%E6%9D%8E%E5%9B%9B",
                "GET",
                false,
            );
        });

        expect(screen.getByRole("heading", { name: "大语言模型在问答系统中的应用" })).toBeInTheDocument();
        expect(screen.getByText("发表日期：2024-06-15")).toBeInTheDocument();
        expect(screen.getByText("导师：李四、张三")).toBeInTheDocument();
        expect(screen.getByText("摘要：本文介绍大语言模型在智能问答中的实践。")).toBeInTheDocument();
        expect(screen.queryByText("作者：李四,张三")).not.toBeInTheDocument();
    });
});
