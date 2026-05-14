import { KeyboardEvent, useMemo, useState } from "react";

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    loading: boolean;
    onPageChange: (page: number) => void;
    showPrevious?: boolean;
    nextLabel?: string;
}

const Pagination = ({
    currentPage,
    totalPages,
    loading,
    onPageChange,
    showPrevious = true,
    nextLabel = "下一页",
}: PaginationProps) => {
    const [jumpInput, setJumpInput] = useState("");

    const safeTotal = Math.max(totalPages, 1);

    const pageNumbers = useMemo(() => {
        const pages: number[] = [];
        const start = Math.max(1, currentPage - 2);
        const end = Math.min(safeTotal, currentPage + 2);
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }, [currentPage, safeTotal]);

    const handleJump = () => {
        const num = Number(jumpInput);
        if (Number.isFinite(num) && num >= 1 && num <= safeTotal) {
            onPageChange(num);
            setJumpInput("");
        }
    };

    const handleJumpKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            handleJump();
        }
    };

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {showPrevious && (
                <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={loading || currentPage <= 1}
                >
                    上一页
                </button>
            )}

            {pageNumbers.map((num) => (
                <button
                    key={num}
                    onClick={() => onPageChange(num)}
                    disabled={loading || num === currentPage}
                    style={{
                        fontWeight: num === currentPage ? 700 : 400,
                        minWidth: 32,
                    }}
                >
                    {num}
                </button>
            ))}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={loading || totalPages === 0 || currentPage >= safeTotal}
            >
                {nextLabel}
            </button>

            <input
                type="number"
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={handleJumpKeyDown}
                placeholder="页码"
                disabled={loading}
                className="paginationJumpInput"
                min={1}
                max={safeTotal}
            />
            <button onClick={handleJump} disabled={loading || jumpInput.trim() === ""}>
                跳转
            </button>
        </div>
    );
};

export default Pagination;
