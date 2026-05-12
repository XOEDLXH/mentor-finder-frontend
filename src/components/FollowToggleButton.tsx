import { CSSProperties } from "react";

interface FollowToggleButtonProps {
    followed: boolean;
    loading: boolean;
    disabled?: boolean;
    onClick: () => void;
    className?: string;
    style?: CSSProperties;
}

const FollowToggleButton = ({
    followed,
    loading,
    disabled = false,
    onClick,
    className,
    style,
}: FollowToggleButtonProps) => {
    const label = followed ? "取消关注" : "关注";

    return (
        <button
            type="button"
            className={className}
            style={style}
            onClick={onClick}
            disabled={disabled || loading}
            aria-busy={loading}
        >
            <span>{label}</span>
            {loading && <span aria-hidden="true" className="followToggleButtonOverlay" />}
        </button>
    );
};

export default FollowToggleButton;
