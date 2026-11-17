import { Badge } from '../ui/badge';

interface Props {
    title: string;
    count?: number;
    suffix?: string;
}

export default function SectionHeading({ title, count, suffix = '篇' }: Props) {
    if (title === '') {
        return null;
    }

    return (
        <header className="relative flex items-center gap-2 pb-2">
            <h2 className="text-[15px] font-medium leading-6 text-ink">{title}</h2>
            {typeof count === 'number' && count > 0 ? (
                <Badge
                    variant="secondary"
                    className="rounded-[3px] border-0 bg-[rgba(136,136,136,0.1)] px-[5px] py-[1px] text-[11px] font-normal leading-[1.44] text-ink-faint"
                >
                    {count} {suffix}
                </Badge>
            ) : null}
            <span
                className="absolute bottom-[3px] left-0 h-[3px] w-10 rounded-[5px] bg-brand shadow-[1px_1px_3px_-1px_var(--accent)]"
                aria-hidden="true"
            />
        </header>
    );
}
