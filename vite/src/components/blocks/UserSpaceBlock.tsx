import { useState } from 'react';
import {
    ArrowUpRight,
    BadgeCheck,
    CalendarDays,
    ChevronRight,
    CircleDot,
    Clock3,
    Eye,
    FileText,
    Link2,
    MapPin,
    MessageSquare,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import type { ForumCircle, PostSummary, UserSpaceComment, UserSpaceProfile } from '../../types';

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

type SpaceTab = 'posts' | 'comments' | 'circles';

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

function SpacePostCard({ post }: { post: PostSummary }) {
    const category = post.categories.find((item) => item.label !== '');

    return (
        <article className="user-space-post">
            {post.thumb !== '' ? (
                <a className="user-space-post-thumb" href={post.url} tabIndex={-1} aria-hidden="true">
                    <img src={post.thumb} alt="" loading="lazy" decoding="async" />
                </a>
            ) : null}
            <div className="user-space-post-body">
                {category ? (
                    <a className="user-space-post-category" href={category.url}>
                        {category.label}
                    </a>
                ) : null}
                <h3 className="user-space-post-title">
                    <a href={post.url}>{post.title}</a>
                </h3>
                {post.excerpt !== '' ? <p className="user-space-post-excerpt">{post.excerpt}</p> : null}
                <div className="user-space-post-meta">
                    {post.date !== '' ? (
                        <time dateTime={post.dateIso}>
                            <CalendarDays aria-hidden="true" />
                            {post.date}
                        </time>
                    ) : null}
                    <span>
                        <MessageSquare aria-hidden="true" />
                        {post.comments}
                    </span>
                    {post.views > 0 ? (
                        <span>
                            <Eye aria-hidden="true" />
                            {post.views}
                        </span>
                    ) : null}
                    <span>
                        <Clock3 aria-hidden="true" />
                        {post.readingTime} 分钟
                    </span>
                </div>
            </div>
        </article>
    );
}

function SpaceCommentItem({ comment }: { comment: UserSpaceComment }) {
    return (
        <a className="user-space-comment" href={comment.url}>
            <span className="user-space-comment-icon" aria-hidden="true">
                <MessageSquare />
            </span>
            <span className="user-space-comment-body">
                <span className="user-space-comment-head">
                    <span className="user-space-comment-target">
                        评论于 <strong>{comment.postTitle || '未命名文章'}</strong>
                    </span>
                    {comment.date !== '' ? (
                        <time dateTime={comment.dateIso}>{comment.date}</time>
                    ) : null}
                </span>
                <span className="user-space-comment-excerpt">
                    {comment.excerpt !== '' ? comment.excerpt : '该评论没有可显示的文本内容。'}
                </span>
            </span>
            <ChevronRight className="user-space-comment-arrow" aria-hidden="true" />
        </a>
    );
}

function SpaceCircleItem({ circle }: { circle: ForumCircle }) {
    return (
        <a className="user-space-circle" href={circle.url}>
            <span className="user-space-circle-icon">
                {circle.icon !== '' ? (
                    <img src={circle.icon} alt="" loading="lazy" decoding="async" />
                ) : (
                    <CircleDot aria-hidden="true" />
                )}
            </span>
            <span className="user-space-circle-body">
                <span className="user-space-circle-name">{circle.name}</span>
                <span className="user-space-circle-meta">
                    {circle.memberCount} 位圈友 · {circle.topicCount} 个帖子
                </span>
            </span>
            <ChevronRight className="user-space-comment-arrow" aria-hidden="true" />
        </a>
    );
}

function SpaceCircleGroup({ title, circles }: { title: string; circles: ForumCircle[] }) {
    if (circles.length === 0) {
        return null;
    }

    return (
        <section className="user-space-circle-group">
            <h3>
                {title}
                <span>{circles.length}</span>
            </h3>
            <div className="user-space-circle-list">
                {circles.map((circle) => (
                    <SpaceCircleItem key={circle.id} circle={circle} />
                ))}
            </div>
        </section>
    );
}

export default function UserSpaceBlock({
    profile,
    posts,
    comments,
    circles,
}: {
    profile: UserSpaceProfile;
    posts: PostSummary[];
    comments: UserSpaceComment[];
    circles: { joined: ForumCircle[]; created: ForumCircle[] };
}) {
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [tab, setTab] = useState<SpaceTab>('posts');
    const name = profile.screenName || profile.name || '用户';
    const initial = name.slice(0, 1);
    const joinText = joined(profile.created);
    const gender = GENDER_LABELS[profile.gender] ?? '';
    const coverStyle = profile.background !== ''
        ? {
              backgroundImage:
                  'linear-gradient(180deg, rgba(8, 12, 18, 0.08), rgba(8, 12, 18, 0.3)), '
                  + `url(${JSON.stringify(profile.background)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
          }
        : undefined;
    const certified = profile.certification?.status === 'approved';

    return (
        <section className="user-space" aria-labelledby="user-space-title">
            <div className="user-space-cover" style={coverStyle} aria-label="个人空间背景">
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
                                {certified && profile.certification ? (
                                    <span
                                        className="chip border-[rgba(77,163,255,0.35)] bg-[rgba(77,163,255,0.1)] text-[#2d7dd2]"
                                        title="已通过站点认证"
                                    >
                                        <BadgeCheck
                                            className="size-3.5"
                                            strokeWidth={2}
                                            aria-hidden="true"
                                        />
                                        {profile.certification.type === 'organization'
                                            ? '组织认证'
                                            : '个人认证'}
                                    </span>
                                ) : null}
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
                        <span className="user-space-privacy">
                            {profile.detailsVisible ? '公开资料' : '部分资料已隐藏'}
                        </span>
                    </div>

                    {profile.signature ? (
                        <p className="user-space-signature">{profile.signature}</p>
                    ) : (
                        <p className="user-space-signature is-empty">
                            这个人很神秘，还没有填写个性签名。
                        </p>
                    )}
                </div>
            </div>

            <div id="user-space-content" className="user-space-content">
                <div className="user-space-tabs" role="tablist" aria-label="个人空间内容">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'posts'}
                        aria-controls="user-space-panel"
                        className={tab === 'posts' ? 'is-active' : ''}
                        onClick={() => setTab('posts')}
                    >
                        文章
                        <span>{profile.posts}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'comments'}
                        aria-controls="user-space-panel"
                        className={tab === 'comments' ? 'is-active' : ''}
                        onClick={() => setTab('comments')}
                    >
                        评论
                        <span>{profile.comments}</span>
                    </button>
                    {profile.circles !== undefined ? (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === 'circles'}
                            aria-controls="user-space-panel"
                            className={tab === 'circles' ? 'is-active' : ''}
                            onClick={() => setTab('circles')}
                        >
                            圈子
                            <span>{profile.circles}</span>
                        </button>
                    ) : null}
                    <span className="user-space-tabs-note">
                        {tab === 'posts'
                            ? '最近发布的文章'
                            : tab === 'comments'
                              ? '最近参与的讨论'
                              : '加入与创建的圈子'}
                    </span>
                </div>

                <div id="user-space-panel" role="tabpanel" className="user-space-panel">
                    {tab === 'posts' ? (
                        posts.length > 0 ? (
                            <div className="user-space-post-grid">
                                {posts.map((post) => (
                                    <SpacePostCard key={post.url} post={post} />
                                ))}
                            </div>
                        ) : (
                            <div className="user-space-empty">
                                <FileText aria-hidden="true" />
                                <p>这个用户还没有发布文章。</p>
                            </div>
                        )
                    ) : tab === 'comments' ? (
                        comments.length > 0 ? (
                        <div className="user-space-comment-list">
                            {comments.map((comment) => (
                                <SpaceCommentItem key={comment.coid} comment={comment} />
                            ))}
                        </div>
                        ) : (
                            <div className="user-space-empty">
                                <MessageSquare aria-hidden="true" />
                                <p>这个用户还没有发表评论。</p>
                            </div>
                        )
                    ) : circles.joined.length > 0 || circles.created.length > 0 ? (
                        <div className="user-space-circle-groups">
                            <SpaceCircleGroup title="加入的圈子" circles={circles.joined} />
                            <SpaceCircleGroup title="创建的圈子" circles={circles.created} />
                        </div>
                    ) : (
                        <div className="user-space-empty">
                            <CircleDot aria-hidden="true" />
                            <p>这个用户还没有加入或创建圈子。</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
