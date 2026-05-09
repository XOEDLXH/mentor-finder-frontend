import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { RootState } from "../redux/store";
import { NetworkError, NetworkErrorType, request } from "../utils/network";

const DEFAULT_SIGNATURE = "这个人很懒，什么也没有留下";
const EMPTY_TEXT = "暂无填写";

interface ProfilePayload {
    avatarUrl: string;
    signature: string;
    personalIntro: string;
    researchExperience: string;
    honors: string;
    projectExperience: string;
    showPersonalIntro: boolean;
    showResearchExperience: boolean;
    showHonors: boolean;
    showProjectExperience: boolean;
    updatedAt?: string;
}

interface ProfileResponse {
    profile?: Partial<ProfilePayload>;
}

const EMPTY_PROFILE: ProfilePayload = {
    avatarUrl: "",
    signature: "",
    personalIntro: "",
    researchExperience: "",
    honors: "",
    projectExperience: "",
    showPersonalIntro: true,
    showResearchExperience: true,
    showHonors: true,
    showProjectExperience: true,
};

const normalizeProfile = (profile?: Partial<ProfilePayload>): ProfilePayload => ({
    avatarUrl: typeof profile?.avatarUrl === "string" ? profile.avatarUrl : "",
    signature: typeof profile?.signature === "string" ? profile.signature : "",
    personalIntro: typeof profile?.personalIntro === "string" ? profile.personalIntro : "",
    researchExperience: typeof profile?.researchExperience === "string" ? profile.researchExperience : "",
    honors: typeof profile?.honors === "string" ? profile.honors : "",
    projectExperience: typeof profile?.projectExperience === "string" ? profile.projectExperience : "",
    showPersonalIntro: typeof profile?.showPersonalIntro === "boolean" ? profile.showPersonalIntro : true,
    showResearchExperience: typeof profile?.showResearchExperience === "boolean" ? profile.showResearchExperience : true,
    showHonors: typeof profile?.showHonors === "boolean" ? profile.showHonors : true,
    showProjectExperience: typeof profile?.showProjectExperience === "boolean" ? profile.showProjectExperience : true,
    updatedAt: typeof profile?.updatedAt === "string" ? profile.updatedAt : "",
});

const UserHomePage = () => {
    const router = useRouter();
    const token = useSelector((state: RootState) => state.auth.token);
    const userName = useSelector((state: RootState) => state.auth.name);
    const displayName = userName.trim() === "" ? "未命名用户" : userName;
    const [profile, setProfile] = useState<ProfilePayload>(EMPTY_PROFILE);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const signature = profile.signature.trim() === "" ? DEFAULT_SIGNATURE : profile.signature;

    useEffect(() => {
        if (token.trim() === "") {
            setProfile(EMPTY_PROFILE);
            return;
        }

        setLoading(true);
        setErrorMessage("");

        request<ProfileResponse>("/api/profile/me", "GET", true)
            .then((res) => setProfile(normalizeProfile(res.profile)))
            .catch((err) => {
                if (err instanceof NetworkError && err.type === NetworkErrorType.UNAUTHORIZED) {
                    setErrorMessage("登录已失效，请重新登录后查看个人信息");
                    return;
                }

                setErrorMessage("个人信息加载失败：" + String(err));
            })
            .finally(() => setLoading(false));
    }, [token]);

    const sections = [
        {
            title: "个人简介",
            body: profile.personalIntro,
            visible: profile.showPersonalIntro,
        },
        {
            title: "科研经历",
            body: profile.researchExperience,
            visible: profile.showResearchExperience,
        },
        {
            title: "所获荣誉",
            body: profile.honors,
            visible: profile.showHonors,
        },
        {
            title: "项目经历",
            body: profile.projectExperience,
            visible: profile.showProjectExperience,
        },
    ].filter((section) => section.visible);

    return (
        <main className="userHomePage">
            <section className="profileHero" aria-label="个人主页信息">
                <div className="profileInfo">
                    {profile.avatarUrl.trim() === "" ? (
                        <div className="defaultAvatar" aria-label="默认头像" />
                    ) : (
                        <img className="avatarImage" src={profile.avatarUrl} alt="用户头像" />
                    )}
                    <div className="profileText">
                        <h1>{displayName}</h1>
                        <p>{signature}</p>
                    </div>
                </div>

                <button
                    className="settingsButton"
                    type="button"
                    onClick={() => void router.push("/profile-settings")}
                >
                    <span className="settingsIcon" aria-hidden="true" />
                    个人设置
                </button>
            </section>

            <section className="profileDetails" aria-label="个人经历信息">
                <div className="sectionHeader">
                    <h2>个人资料</h2>
                    {profile.updatedAt && <p>最近更新：{profile.updatedAt}</p>}
                </div>

                {token.trim() === "" ? (
                    <div className="emptyPanel">
                        <p>请先登录后查看个人资料。</p>
                    </div>
                ) : loading ? (
                    <div className="emptyPanel">
                        <p>加载中...</p>
                    </div>
                ) : (
                    <>
                        {sections.length === 0 ? (
                            <div className="emptyPanel">
                                <p>当前未展示任何个人资料。</p>
                            </div>
                        ) : (
                            <div className="detailGrid">
                                {sections.map((section) => (
                                    <article className="detailCard" key={section.title}>
                                        <h3>{section.title}</h3>
                                        <p>{section.body.trim() === "" ? EMPTY_TEXT : section.body}</p>
                                    </article>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {errorMessage !== "" && (
                    <div className="errorPanel" role="alert">
                        {errorMessage}
                    </div>
                )}
            </section>

            <style jsx>{`
                .userHomePage {
                    width: 100%;
                }

                .profileHero {
                    position: relative;
                    display: flex;
                    min-height: 176px;
                    max-width: 1120px;
                    align-items: flex-end;
                    justify-content: space-between;
                    overflow: hidden;
                    margin: 0 auto;
                    padding: 24px 28px;
                    border: 1px solid #d7d7d7;
                    border-radius: 8px;
                    background:
                        radial-gradient(circle at 8% 18%, rgba(190, 206, 226, 0.72) 0 32px, transparent 34px),
                        radial-gradient(circle at 48% 8%, rgba(255, 243, 214, 0.9) 0 30px, transparent 32px),
                        radial-gradient(circle at 63% 38%, rgba(191, 219, 245, 0.74) 0 42px, transparent 45px),
                        radial-gradient(circle at 78% 37%, rgba(240, 224, 91, 0.72) 0 35px, transparent 38px),
                        radial-gradient(circle at 88% 25%, rgba(174, 231, 250, 0.88) 0 54px, transparent 58px),
                        radial-gradient(circle at 98% 47%, rgba(255, 255, 255, 0.96) 0 66px, transparent 70px),
                        linear-gradient(120deg, #111 0%, #24211d 44%, #2d2217 67%, #1c2630 100%);
                    color: #fff;
                }

                .profileHero::before {
                    position: absolute;
                    inset: 0;
                    content: "";
                    backdrop-filter: blur(10px);
                    background: rgba(0, 0, 0, 0.2);
                }

                .profileInfo,
                .settingsButton {
                    position: relative;
                    z-index: 1;
                }

                .profileInfo {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }

                .defaultAvatar,
                .avatarImage {
                    width: 68px;
                    height: 68px;
                    flex: 0 0 auto;
                    border: 2px solid rgba(255, 255, 255, 0.9);
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
                }

                .defaultAvatar {
                    background:
                        linear-gradient(135deg, transparent 0 18%, #5ba8e6 18% 30%, transparent 30% 100%),
                        linear-gradient(45deg, #f7fbff 0 25%, transparent 25% 50%, #76b9ec 50% 74%, transparent 74% 100%),
                        #d9eefc;
                }

                .avatarImage {
                    display: block;
                    object-fit: cover;
                    background: #fff;
                }

                .profileText h1 {
                    margin: 0 0 10px;
                    font-size: 30px;
                    line-height: 1;
                    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
                }

                .profileText p {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
                }

                .settingsButton {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 9px 14px;
                    border: 1px solid rgba(255, 255, 255, 0.42);
                    border-radius: 4px;
                    background: rgba(35, 47, 59, 0.62);
                    color: #fff;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 700;
                }

                .settingsButton:hover,
                .settingsButton:focus {
                    background: rgba(35, 47, 59, 0.82);
                    outline: none;
                }

                .settingsIcon {
                    position: relative;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-radius: 50%;
                }

                .settingsIcon::before,
                .settingsIcon::after {
                    position: absolute;
                    content: "";
                    background: #fff;
                }

                .settingsIcon::before {
                    top: 5px;
                    left: -5px;
                    width: 22px;
                    height: 2px;
                }

                .settingsIcon::after {
                    top: -5px;
                    left: 5px;
                    width: 2px;
                    height: 22px;
                }

                .profileDetails {
                    max-width: 1120px;
                    margin: 20px auto 0;
                }

                .sectionHeader {
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 12px;
                }

                .sectionHeader h2 {
                    margin: 0;
                    font-size: 24px;
                }

                .sectionHeader p {
                    margin: 0;
                    color: #666;
                    font-size: 14px;
                }

                .detailGrid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 14px;
                }

                .detailCard,
                .emptyPanel,
                .errorPanel {
                    border: 1px solid #d7d7d7;
                    border-radius: 8px;
                    background: #fff;
                }

                .detailCard {
                    min-height: 132px;
                    padding: 18px;
                }

                .detailCard h3 {
                    margin: 0 0 12px;
                    font-size: 18px;
                }

                .detailCard p {
                    margin: 0;
                    color: #333;
                    font-size: 15px;
                    line-height: 1.7;
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                }

                .emptyPanel,
                .errorPanel {
                    padding: 16px 18px;
                }

                .emptyPanel p {
                    margin: 0;
                    color: #555;
                }

                .errorPanel {
                    margin-top: 12px;
                    border-color: #f1aeb5;
                    background: #f8d7da;
                    color: #58151c;
                }

                @media (max-width: 720px) {
                    .profileHero {
                        min-height: 210px;
                        align-items: flex-start;
                        flex-direction: column;
                        gap: 24px;
                        justify-content: flex-end;
                        margin: 0 4px;
                        padding: 28px 18px;
                    }

                    .defaultAvatar {
                        width: 64px;
                        height: 64px;
                    }

                    .profileText h1 {
                        font-size: 24px;
                    }

                    .profileText p {
                        font-size: 16px;
                    }

                    .profileDetails {
                        margin: 18px 4px 0;
                    }

                    .sectionHeader {
                        align-items: flex-start;
                        flex-direction: column;
                        gap: 6px;
                    }

                }
            `}</style>
        </main>
    );
};

export default UserHomePage;
