import { useState } from 'react';

interface Props {
    name: string;
    avatar?: string;
    className?: string;
    fallbackImage?: string;
}

export default function UserAvatar({ name, avatar, className = 'size-9', fallbackImage }: Props) {
    const [failed, setFailed] = useState(false);
    const initial = (name.trim() || '用').slice(0, 1);
    const base =
        className +
        ' grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-[13px] font-medium text-brand';

    if (!avatar || failed) {
        if (fallbackImage) {
            return (
                <span className={base}>
                    <img className="size-full object-contain p-1" src={fallbackImage} alt="" loading="lazy" />
                </span>
            );
        }

        return <span className={base}>{initial}</span>;
    }

    return (
        <span className={base}>
            <img
                className="size-full object-cover"
                src={avatar}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
            />
        </span>
    );
}
