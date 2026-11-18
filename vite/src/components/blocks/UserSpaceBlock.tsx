import { useState } from 'react';
import {
    ArrowUpRight,
    CalendarDays,
    FileText,
    Link2,
    MapPin,
    MessageSquare,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import type { UserSpaceProfile } from '../../types';

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

const GENDER_LABELS: Record<string, string> = {
    secret: '保密',
    male: '男',
    female: '女',
    other: '其他',
};

function joined(value: string): string {
    if (value === '') {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')} 加入`;
}

export default function UserSpaceBlock({ profile }: { profile: UserSpaceProfile }) {
    const [avatarFailed, setAvatarFailed] = useState(false);
    const name = profile.screenName || profile.name || '用户';
    const initial = name.slice(0, 1);
    const joinText = joined(profile.created);
    const gender = GENDER_LABELS[profile.gender] ?? '';

    return (
        <section className="user-space" aria-labelledby="user-space-title">
            <div className="user-space-cover" aria-hidden="true">
                <span className="user-space-cover-grid" />
            </div>
            <div className="user-space-body">
                <div className="user-space-avatar">
                    {profile.avatar && !avatarFailed ? (
                        <img
                            src={profile.avatar}
                            alt=""
                            loading="eager"
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarFailed(true)}
                        />
                    ) : (
                        <span aria-hidden="true">{initial}</span>
                    )}
                </div>

                <div className="user-space-main">
                    <div className="user-space-heading">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 id="user-space-title" className="user-space-name">
                                    {name}
                                </h1>
                                <span className="chip">
                                    <ShieldCheck
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    {GROUP_LABELS[profile.group] ?? profile.group}
                                </span>
                            </div>
                            <p className="user-space-handle">
                                @{profile.name}
                                <span aria-hidden="true">·</span>
                                UID {profile.uid}
                            </p>
                        </div>
                        {profile.isSelf && profile.editUrl ? (
                            <a className="user-space-edit" href={profile.editUrl}>
                                <UserRound className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                编辑资料
                            </a>
                        ) : null}
                    </div>

                    {profile.signature ? (
                        <p className="user-space-signature">{profile.signature}</p>
                    ) : (
                        <p className="user-space-signature is-empty">
                            这个人很神秘，还没有填写个性签名。
                        </p>
                    )}

                    <div className="user-space-meta">
                        {joinText ? (
                            <span>
                                <CalendarDays
                                    className="size-3.5"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                                {joinText}
                            </span>
                        ) : null}
                        {profile.location ? (
                            <span>
                                <MapPin
                                    className="size-3.5"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                                {profile.location}
                            </span>
                        ) : null}
                        {gender ? (
                            <span>
                                <UserRound
                                    className="size-3.5"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                                {gender}
                            </span>
                        ) : null}
                        {profile.url ? (
                            <a href={profile.url} target="_blank" rel="noreferrer noopener">
                                <Link2
                                    className="size-3.5"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                                个人主页
                                <ArrowUpRight
                                    className="size-3"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                            </a>
                        ) : null}
                    </div>

                    <div className="user-space-stats">
                        <a href="#user-space-posts">
                            <FileText className="size-4" strokeWidth={1.8} aria-hidden="true" />
                            <strong>{profile.posts}</strong>
                            <span>文章</span>
                        </a>
                        <a href="#user-space-posts">
                            <MessageSquare
                                className="size-4"
                                strokeWidth={1.8}
                                aria-hidden="true"
                            />
                            <strong>{profile.comments}</strong>
                            <span>评论</span>
                        </a>
                        <span className="user-space-privacy">
                            {profile.detailsVisible ? '公开资料' : '部分资料已隐藏'}
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
