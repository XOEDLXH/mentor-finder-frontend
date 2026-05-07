import { useSelector } from "react-redux";

import { RootState } from "../redux/store";

const DEFAULT_SIGNATURE = "这个人很懒，什么也没有留下";

const UserHomePage = () => {
    const userName = useSelector((state: RootState) => state.auth.name);
    const displayName = userName.trim() === "" ? "未命名用户" : userName;

    return (
        <main className="userHomePage">
            <section className="profileHero" aria-label="个人主页信息">
                <div className="profileInfo">
                    <div className="defaultAvatar" aria-label="默认头像" />
                    <div className="profileText">
                        <h1>{displayName}</h1>
                        <p>{DEFAULT_SIGNATURE}</p>
                    </div>
                </div>

                <button className="settingsButton" type="button">
                    <span className="settingsIcon" aria-hidden="true" />
                    个人设置
                </button>
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

                .defaultAvatar {
                    width: 68px;
                    height: 68px;
                    flex: 0 0 auto;
                    border: 2px solid rgba(255, 255, 255, 0.9);
                    border-radius: 50%;
                    background:
                        linear-gradient(135deg, transparent 0 18%, #5ba8e6 18% 30%, transparent 30% 100%),
                        linear-gradient(45deg, #f7fbff 0 25%, transparent 25% 50%, #76b9ec 50% 74%, transparent 74% 100%),
                        #d9eefc;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
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
                    cursor: default;
                    font-size: 16px;
                    font-weight: 700;
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
                }
            `}</style>
        </main>
    );
};

export default UserHomePage;
