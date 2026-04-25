import { useRouter } from "next/router";
import { RootState } from "../redux/store";
import { useSelector } from "react-redux";

const HomeScreen = () => {
    const router = useRouter();
    const userName = useSelector((state: RootState) => state.auth.name);
    const userRole = useSelector((state: RootState) => state.auth.role);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
            <h2>找导师</h2>
            <p>根据导师姓名、论文标题和研究方向快速检索目标导师与论文信息。</p>
            {userName !== "" && <p>欢迎回来，{userName}</p>}
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => router.push("/search")}>进入检索</button>
                <button onClick={() => router.push("/timeline")}>论文时间线</button>
                {userName !== "" && (
                    <button onClick={() => router.push("/profile")}>个人主页</button>
                )}
                {userRole === "admin" && (
                    <button onClick={() => router.push("/admin-users")}>用户管理</button>
                )}
            </div>
        </div>
    );
};

export default HomeScreen;
