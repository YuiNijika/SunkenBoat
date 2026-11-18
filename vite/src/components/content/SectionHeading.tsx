import { Badge } from '../ui/badge';

interface Props {
    title: string;
    description?: string;
    count?: number;
    suffix?: string;
    align?: 'left' | 'center';
}

export default function SectionHeading({
    title,
    description = '',
    count,
    suffix = '篇',
    align = 'left',
}: Props) {
    if (title === '' && description === '') {
        return null;
    }

    return (
        <header className={'section-heading' + (align === 'center' ? ' is-center' : '')}>
            <div className="section-heading-row">
                {title !== '' ? (
                    <h2 className="text-[15px] font-medium leading-6 text-ink">{title}</h2>
                ) : null}
                {typeof count === 'number' && count > 0 ? (
                    <Badge
                        variant="secondary"
                        className="rounded-[3px] border-0 bg-[rgba(136,136,136,0.1)] px-[5px] py-[1px] text-[11px] font-normal leading-[1.44] text-ink-faint"
                    >
                        {count} {suffix}
                    </Badge>
                ) : null}
            </div>
            {description !== '' ? <p className="section-heading-text">{description}</p> : null}
            <span
                className="section-heading-bar"
                aria-hidden="true"
            />
        </header>
    );
}
