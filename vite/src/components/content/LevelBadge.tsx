import type { UserEconomyLevel } from '../../types';

interface Props {
    level: UserEconomyLevel;
    className?: string;
    iconClassName?: string;
    showTitle?: boolean;
}

export default function LevelBadge({
    level,
    className = '',
    iconClassName = 'h-4 w-auto',
    showTitle = true,
}: Props) {
    const title = level.title.trim() || `LV${level.level}`;

    return (
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`.trim()} title={title}>
            {level.icon ? (
                <img
                    className={`${iconClassName} shrink-0 object-contain`.trim()}
                    src={level.icon}
                    alt={showTitle ? '' : title}
                    loading="lazy"
                />
            ) : null}
            {showTitle ? (
                <span className="truncate font-medium" style={{ color: level.color }}>
                    {title}
                </span>
            ) : null}
        </span>
    );
}
