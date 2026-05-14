import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";

import { FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { NetworkError, NetworkErrorType, request } from "../utils/network";

interface ProfileSettings {
    avatarUrl: string;
    signature: string;
    showPersonalIntro: boolean;
    showResearchExperience: boolean;
    showHonors: boolean;
    showProjectExperience: boolean;
}

interface ProfileResponse {
    profile?: Partial<ProfileSettings>;
}

const EMPTY_SETTINGS: ProfileSettings = {
    avatarUrl: "",
    signature: "",
    showPersonalIntro: true,
    showResearchExperience: true,
    showHonors: true,
    showProjectExperience: true,
};

const normalizeSettings = (profile?: Partial<ProfileSettings>): ProfileSettings => ({
    avatarUrl: typeof profile?.avatarUrl === "string" ? profile.avatarUrl : "",
    signature: typeof profile?.signature === "string" ? profile.signature : "",
    showPersonalIntro: typeof profile?.showPersonalIntro === "boolean" ? profile.showPersonalIntro : true,
    showResearchExperience: typeof profile?.showResearchExperience === "boolean" ? profile.showResearchExperience : true,
    showHonors: typeof profile?.showHonors === "boolean" ? profile.showHonors : true,
    showProjectExperience: typeof profile?.showProjectExperience === "boolean" ? profile.showProjectExperience : true,
});

const ProfileSettingsPage = () => {
    const router = useRouter();
    const token = useSelector((state: RootState) => state.auth.token);
    const userId = useSelector((state: RootState) => state.auth.userId);
    const [settings, setSettings] = useState<ProfileSettings>(EMPTY_SETTINGS);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    useEffect(() => {
        if (token.trim() === "") {
            setSettings(EMPTY_SETTINGS);
            return;
        }

        setLoading(true);
        setErrorMessage("");

        request<ProfileResponse>("/api/profile/me", "GET", true)
            .then((res) => setSettings(normalizeSettings(res.profile)))
            .catch((err) => {
                if (err instanceof NetworkError && err.type === NetworkErrorType.UNAUTHORIZED) {
                    setErrorMessage("登录已失效，请重新登录后再试");
                    return;
                }
                setErrorMessage(FAILURE_PREFIX + String(err));
            })
            .finally(() => setLoading(false));
    }, [token]);

    const saveSettings = async () => {
        setSaving(true);
        setSuccessMessage("");
        setErrorMessage("");

        try {
            const res = await request<ProfileResponse>("/api/profile/me", "PUT", true, settings);
            setSettings(normalizeSettings(res.profile));
            setSuccessMessage("个人设置保存成功");
        } catch (err) {
            if (err instanceof NetworkError && err.type === NetworkErrorType.UNAUTHORIZED) {
                setErrorMessage("登录已失效，请重新登录后再试");
                return;
            }
            setErrorMessage(FAILURE_PREFIX + String(err));
        } finally {
            setSaving(false);
        }
    };

    const profileHref = userId === undefined ? "/follows" : `/users/${userId}`;

    if (token.trim() === "") {
        return (
            <main className="settingsPage">
                <h2>个人设置</h2>
                <p>请先登录后再修改个人设置。</p>
                <button type="button" onClick={() => void router.push("/")}>返回首页</button>
            </main>
        );
    }

    return (
        <main className="settingsPage">
            <div className="pageHeader">
                <div>
                    <h2>个人设置</h2>
                    <p>管理头像、个性签名和个人主页展示内容。</p>
                </div>
                <button type="button" onClick={() => void router.push(profileHref)}>返回个人主页</button>
            </div>

            {loading ? (
                <p>加载中...</p>
            ) : (
                <>
                    <section className="settingsSection" aria-label="头像和签名设置">
                        <div className="avatarPreview">
                            {settings.avatarUrl.trim() === "" ? (
                                <div className="defaultAvatar" aria-label="默认头像" />
                            ) : (
                                <img src={settings.avatarUrl} alt="头像预览" />
                            )}
                        </div>

                        <label htmlFor="avatarUrl">头像地址</label>
                        <input
                            id="avatarUrl"
                            type="text"
                            value={settings.avatarUrl}
                            placeholder="粘贴图片 URL，留空则使用默认头像"
                            onChange={(e) => setSettings((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                        />

                        <label htmlFor="signature">个性签名</label>
                        <textarea
                            id="signature"
                            value={settings.signature}
                            placeholder="写一句想展示在个人主页顶部的话"
                            maxLength={200}
                            onChange={(e) => setSettings((prev) => ({ ...prev, signature: e.target.value }))}
                        />
                    </section>

                    <section className="settingsSection" aria-label="展示内容设置">
                        <h3>个人主页展示</h3>
                        <div className="visibilityOptions">
                            <label className="checkboxRow">
                                <input
                                    type="checkbox"
                                    checked={settings.showPersonalIntro}
                                    onChange={(e) => setSettings((prev) => ({ ...prev, showPersonalIntro: e.target.checked }))}
                                />
                                <span>展示个人简介</span>
                            </label>
                            <label className="checkboxRow">
                                <input
                                    type="checkbox"
                                    checked={settings.showResearchExperience}
                                    onChange={(e) => setSettings((prev) => ({ ...prev, showResearchExperience: e.target.checked }))}
                                />
                                <span>展示科研经历</span>
                            </label>
                            <label className="checkboxRow">
                                <input
                                    type="checkbox"
                                    checked={settings.showHonors}
                                    onChange={(e) => setSettings((prev) => ({ ...prev, showHonors: e.target.checked }))}
                                />
                                <span>展示所获荣誉</span>
                            </label>
                            <label className="checkboxRow">
                                <input
                                    type="checkbox"
                                    checked={settings.showProjectExperience}
                                    onChange={(e) => setSettings((prev) => ({ ...prev, showProjectExperience: e.target.checked }))}
                                />
                                <span>展示项目经历</span>
                            </label>
                        </div>
                    </section>

                    <div className="actions">
                        <button type="button" onClick={() => void saveSettings()} disabled={saving}>
                            {saving ? "保存中..." : "保存设置"}
                        </button>
                    </div>
                </>
            )}

            {errorMessage !== "" && <div className="errorPanel">{errorMessage}</div>}
            {successMessage !== "" && <div className="successPanel">{successMessage}</div>}

            <style jsx>{`
                .settingsPage {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    max-width: 760px;
                    margin: 0 auto;
                }

                .pageHeader {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                }

                .pageHeader h2 {
                    margin: 0 0 6px;
                }

                .pageHeader p {
                    margin: 0;
                    color: #555;
                }

                .settingsSection {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    padding: 16px;
                    border: 1px solid #d7d7d7;
                    border-radius: 8px;
                    background: #fff;
                }

                .settingsSection h3 {
                    margin: 0 0 4px;
                }

                .settingsSection input[type="text"],
                .settingsSection textarea {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 9px 10px;
                    border: 1px solid #bbb;
                    border-radius: 4px;
                    font-size: 15px;
                }

                .settingsSection textarea {
                    min-height: 88px;
                    resize: vertical;
                }

                .avatarPreview {
                    display: flex;
                    align-items: center;
                    min-height: 84px;
                }

                .avatarPreview img,
                .defaultAvatar {
                    width: 72px;
                    height: 72px;
                    border: 1px solid #ccc;
                    border-radius: 50%;
                    object-fit: cover;
                    background:
                        linear-gradient(135deg, transparent 0 18%, #5ba8e6 18% 30%, transparent 30% 100%),
                        linear-gradient(45deg, #f7fbff 0 25%, transparent 25% 50%, #76b9ec 50% 74%, transparent 74% 100%),
                        #d9eefc;
                }

                .visibilityOptions {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px 12px;
                }

                .checkboxRow {
                    display: grid;
                    grid-template-columns: 18px minmax(0, 1fr);
                    align-items: center;
                    gap: 10px;
                    min-height: 42px;
                    padding: 10px 12px;
                    border: 1px solid #d7d7d7;
                    border-radius: 6px;
                    background: #fafafa;
                    cursor: pointer;
                }

                .checkboxRow input {
                    width: 16px;
                    height: 16px;
                    margin: 0;
                }

                .checkboxRow span {
                    min-width: 0;
                    line-height: 1.4;
                    overflow-wrap: anywhere;
                }

                .actions {
                    display: flex;
                    gap: 8px;
                }

                .errorPanel,
                .successPanel {
                    padding: 12px;
                    border-radius: 6px;
                }

                .errorPanel {
                    border: 1px solid #f1aeb5;
                    background: #f8d7da;
                }

                .successPanel {
                    border: 1px solid #badbcc;
                    background: #d1e7dd;
                }

                @media (max-width: 560px) {
                    .pageHeader {
                        flex-direction: column;
                    }

                    .visibilityOptions {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </main>
    );
};

export default ProfileSettingsPage;
