import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { NetworkError, NetworkErrorType, request } from "../utils/network";
import { MentorVerificationRequestResult } from "../utils/types";

// 定义个人资料的数据结构
interface ProfilePayload {
    researchExperience: string;   // 科研经历
    honors: string;               // 所获荣誉
    projectExperience: string;    // 项目经历
    updatedAt?: string;           // 最后更新时间（可选）
}

// 空资料模板，用于初始化或重置
const EMPTY_PROFILE: ProfilePayload = {
    researchExperience: "",
    honors: "",
    projectExperience: "",
};

const ProfileScreen = () => {
    const router = useRouter();
    // 从 Redux store 中获取认证 token
    const token = useSelector((state: RootState) => state.auth.token);

    // 状态管理
    const [loading, setLoading] = useState(false);        // 加载资料中
    const [saving, setSaving] = useState(false);          // 保存资料中
    const [errorMessage, setErrorMessage] = useState(""); // 错误提示
    const [successMessage, setSuccessMessage] = useState(""); // 成功提示
    const [profile, setProfile] = useState<ProfilePayload>(EMPTY_PROFILE); // 资料数据
    const [mentorVerificationName, setMentorVerificationName] = useState("");
    const [mentorVerificationSubmitting, setMentorVerificationSubmitting] = useState(false);
    const [mentorVerificationRequest, setMentorVerificationRequest] = useState<MentorVerificationRequestResult | undefined>(undefined);

    // 组件挂载或 token 变化时，拉取用户资料
    useEffect(() => {
        if (token === "") {
            return; // 未登录，不请求
        }

        setLoading(true);
        setErrorMessage("");

        // 发起 GET 请求获取当前用户的个人资料
        request("/api/profile/me", "GET", true)
            .then((res) => {
                const raw = (res.profile ?? {}) as Partial<ProfilePayload>;
                // 安全地设置各字段，确保类型为字符串
                setProfile({
                    researchExperience: typeof raw.researchExperience === "string" ? raw.researchExperience : "",
                    honors: typeof raw.honors === "string" ? raw.honors : "",
                    projectExperience: typeof raw.projectExperience === "string" ? raw.projectExperience : "",
                    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
                });
                setMentorVerificationRequest(
                    typeof res.mentorVerificationRequest === "object" && res.mentorVerificationRequest
                        ? res.mentorVerificationRequest as MentorVerificationRequestResult
                        : undefined,
                );
            })
            .catch((err) => {
                // 处理未授权错误（token 失效）
                if (err instanceof NetworkError && err.type === NetworkErrorType.UNAUTHORIZED) {
                    setErrorMessage("登录已失效，请重新登录后再试");
                    return;
                }
                // 其他错误统一显示
                setErrorMessage(FAILURE_PREFIX + String(err));
            })
            .finally(() => setLoading(false));
    }, [token]); // 依赖 token，token 变化时重新获取

    // 保存个人资料（PUT 请求）
    const saveProfile = async () => {
        setSaving(true);
        setSuccessMessage("");
        setErrorMessage("");

        try {
            // 发送 PUT 请求，携带当前 profile 中的三个文本字段
            const res = await request("/api/profile/me", "PUT", true, {
                researchExperience: profile.researchExperience,
                honors: profile.honors,
                projectExperience: profile.projectExperience,
            });

            // 更新成功后，用返回的最新资料刷新界面
            const raw = (res.profile ?? {}) as Partial<ProfilePayload>;
            setProfile({
                researchExperience: typeof raw.researchExperience === "string" ? raw.researchExperience : "",
                honors: typeof raw.honors === "string" ? raw.honors : "",
                projectExperience: typeof raw.projectExperience === "string" ? raw.projectExperience : "",
                updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
            });
            setSuccessMessage("个人信息保存成功");
        } catch (err) {
            // 处理未授权错误
            if (err instanceof NetworkError && err.type === NetworkErrorType.UNAUTHORIZED) {
                setErrorMessage("登录已失效，请重新登录后再试");
                return;
            }
            setErrorMessage(FAILURE_PREFIX + String(err));
        } finally {
            setSaving(false);
        }
    };

    const submitMentorVerificationRequest = async () => {
        const submittedName = mentorVerificationName.trim();
        if (submittedName === "") {
            setErrorMessage("导师身份申请姓名不能为空");
            return;
        }

        setMentorVerificationSubmitting(true);
        setSuccessMessage("");
        setErrorMessage("");

        try {
            const res = await request("/api/profile/mentor-verification-request", "POST", true, {
                submittedName,
            });
            setMentorVerificationRequest(res.mentorVerificationRequest as MentorVerificationRequestResult);
            setMentorVerificationName("");
            setSuccessMessage("导师身份认证申请已提交");
        } catch (err) {
            if (err instanceof NetworkError && err.type === NetworkErrorType.UNAUTHORIZED) {
                setErrorMessage("登录已失效，请重新登录后再试");
                return;
            }
            setErrorMessage(FAILURE_PREFIX + String(err));
        } finally {
            setMentorVerificationSubmitting(false);
        }
    };

    // 未登录状态：显示提示和操作按钮
    if (token === "") {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
                <h2>个人主页</h2>
                <p>请先登录后再维护个人信息。</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => router.push("/")}>返回首页</button>
                </div>
            </div>
        );
    }

    // 已登录：展示资料编辑表单
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
            <h2>个人主页</h2>
            <p>你可以在这里维护科研经历、所获荣誉与项目经历等信息。</p>

            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => router.push("/")}>返回首页</button>
                <button onClick={() => router.push("/search")}>去检索</button>
                <button onClick={() => router.push("/private-mentor")}>添加个人导师</button>
            </div>

            {loading ? (
                <p>加载中...</p>
            ) : (
                <>
                    {/* 科研经历输入框 */}
                    <label htmlFor="researchExperience">科研经历</label>
                    <textarea
                        id="researchExperience"
                        value={profile.researchExperience}
                        placeholder="例如：参与实验室方向、发表论文、科研竞赛等"
                        onChange={(e) => setProfile((prev) => ({ ...prev, researchExperience: e.target.value }))}
                        style={{ minHeight: 120 }}
                    />

                    {/* 所获荣誉输入框 */}
                    <label htmlFor="honors">所获荣誉</label>
                    <textarea
                        id="honors"
                        value={profile.honors}
                        placeholder="例如：奖学金、竞赛获奖、优秀学生等"
                        onChange={(e) => setProfile((prev) => ({ ...prev, honors: e.target.value }))}
                        style={{ minHeight: 120 }}
                    />

                    {/* 项目经历输入框 */}
                    <label htmlFor="projectExperience">项目经历</label>
                    <textarea
                        id="projectExperience"
                        value={profile.projectExperience}
                        placeholder="例如：项目名称、你的职责、技术栈、结果等"
                        onChange={(e) => setProfile((prev) => ({ ...prev, projectExperience: e.target.value }))}
                        style={{ minHeight: 120 }}
                    />

                    {/* 保存按钮，点击时调用异步保存函数，使用 void 忽略返回的 Promise */}
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => void saveProfile()} disabled={saving}>
                            {saving ? "保存中..." : "保存个人信息"}
                        </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
                        <h3 style={{ margin: 0 }}>导师身份认证申请</h3>
                        <p style={{ margin: 0 }}>非管理员用户可在此提交导师身份绑定申请，请填写你的姓名。</p>
                        <input
                            type="text"
                            value={mentorVerificationName}
                            placeholder="填写申请绑定的导师姓名"
                            onChange={(e) => setMentorVerificationName(e.target.value)}
                            disabled={mentorVerificationSubmitting}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                onClick={() => void submitMentorVerificationRequest()}
                                disabled={mentorVerificationSubmitting || mentorVerificationName.trim() === ""}
                            >
                                {mentorVerificationSubmitting ? "提交中..." : "提交导师身份申请"}
                            </button>
                        </div>

                        {mentorVerificationRequest && (
                            <div style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }}>
                                <p style={{ margin: "0 0 4px" }}>最近申请姓名：{mentorVerificationRequest.submittedName}</p>
                                <p style={{ margin: "0 0 4px" }}>当前状态：{mentorVerificationRequest.status}</p>
                                <p style={{ margin: 0 }}>提交时间：{mentorVerificationRequest.createdAt || "未知"}</p>
                            </div>
                        )}
                    </div>

                    {/* 显示最后更新时间（如果存在） */}
                    {profile.updatedAt && <p style={{ margin: 0 }}>最近更新：{profile.updatedAt}</p>}
                </>
            )}

            {/* 错误消息提示框 */}
            {errorMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #f1aeb5", backgroundColor: "#f8d7da" }}>
                    {errorMessage}
                </div>
            )}

            {/* 成功消息提示框 */}
            {successMessage !== "" && (
                <div style={{ padding: 12, border: "1px solid #badbcc", backgroundColor: "#d1e7dd" }}>
                    {successMessage}
                </div>
            )}
        </div>
    );
};

export default ProfileScreen;
