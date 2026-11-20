import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, Clock3, Hash, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { notifyError } from '../../lib/notify';
import type { PostSummary, SearchScope, SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    widgets: WidgetsData;
    scope?: SearchScope | null;
    onClose: () => void;
}

export default function SearchPanel({ site, widgets, scope = null, onClose }: Props) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [remoteResults, setRemoteResults] = useState<PostSummary[]>([]);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const goToSiteSearch = (value: string) => {
        onClose();
        const target = new URL(site.url, window.location.origin);
        target.searchParams.set('s', value);
        navigate(target.pathname + target.search);
    };

    const submit = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const value = query.trim();
        if (value === '') {
            inputRef.current?.focus();
            return;
        }

        if (!scope || scope.slug === '') {
            goToSiteSearch(value);
            return;
        }

        setRemoteLoading(true);
        try {
            const endpoint = new URL(site.apiBase.replace(/\/+$/, '') + '/search');
            endpoint.searchParams.set('q', value);
            endpoint.searchParams.set(scope.type, scope.slug);
            const response = await fetch(endpoint.toString(), {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            const payload = (await response.json().catch(() => null)) as
                | { data?: unknown; message?: string }
                | null;
            if (!response.ok) {
                throw new Error(payload?.message || '搜索失败，请稍后再试。');
            }
            setRemoteResults(
                Array.isArray(payload?.data) ? (payload.data as PostSummary[]) : []
            );
        } catch (reason) {
            setRemoteResults([]);
            notifyError(
                reason instanceof Error ? reason.message : '搜索失败，请稍后再试。'
            );
        } finally {
            setRemoteLoading(false);
        }
    };

    const openPost = (url: string) => {
        onClose();
        const target = new URL(url, window.location.origin);
        navigate(target.pathname + target.search + target.hash);
    };

    const terms = useMemo(
        () =>
            Array.from(
                new Set([
                    ...widgets.tags.map((tag) => tag.label),
                    ...widgets.categories.map((category) => category.label),
                ])
            )
                .map((term) => term.trim())
                .filter((term) => term !== '')
                .slice(0, 16),
        [widgets.tags, widgets.categories]
    );
    const recent = useMemo(() => widgets.recent.slice(0, 5), [widgets.recent]);
    const normalized = query.trim().toLowerCase();
    const matchedTerms = useMemo(
        () =>
            normalized === ''
                ? terms.slice(0, 10)
                : terms.filter((term) => term.toLowerCase().includes(normalized)).slice(0, 10),
        [normalized, terms]
    );
    const matchedRecent = useMemo(
        () =>
            normalized === ''
                ? recent
                : recent.filter((post) => post.title.toLowerCase().includes(normalized)),
        [normalized, recent]
    );

    return (
        <div
            id="ttdf-search-panel"
            className="search-panel absolute inset-x-0 top-full z-50 border-t border-line bg-surface shadow-card"
        >
            <div className="container-page py-4 sm:py-5">
                <form className="search-panel-form" role="search" onSubmit={(event) => void submit(event)}>
                    <div className="search-panel-input-wrap">
                        <Search
                            className="size-[18px] shrink-0 text-ink-mute"
                            strokeWidth={1.8}
                            aria-hidden="true"
                        />
                        <input
                            ref={inputRef}
                            className="search-panel-input"
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索文章、分类或标签…"
                            aria-label="搜索关键词"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {query !== '' ? (
                            <button
                                type="button"
                                className="search-panel-clear"
                                aria-label="清空搜索"
                                onClick={() => {
                                    setQuery('');
                                    inputRef.current?.focus();
                                }}
                            >
                                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
                            </button>
                        ) : (
                            <kbd className="search-panel-kbd">Enter</kbd>
                        )}
                    </div>
                    <Button
                        type="submit"
                        className="h-11 shrink-0 rounded-[7px] px-5"
                        disabled={remoteLoading}
                    >
                        {remoteLoading ? '搜索中…' : '搜索'}
                    </Button>
                </form>

                <div className="search-panel-hint">
                    <span>
                        {scope ? `在「${scope.label}」中搜索` : '按 Enter 搜索全站'}
                    </span>
                    <span>Esc 关闭</span>
                </div>

                <div className="search-panel-body" aria-live="polite">
                    {scope !== null ? (
                        <>
                            {remoteResults.length > 0 ? (
                                <div className="search-panel-group">
                                    <p className="search-panel-label">
                                        「{scope.label}」中的搜索结果
                                    </p>
                                    <div className="search-panel-results">
                                        {remoteResults.map((post) => (
                                            <button
                                                key={post.url + post.title}
                                                type="button"
                                                className="search-panel-result"
                                                onClick={() => openPost(post.url)}
                                            >
                                                <span className="search-panel-thumb">
                                                    {post.thumb ? (
                                                        <img
                                                            src={post.thumb}
                                                            alt=""
                                                            width={64}
                                                            height={48}
                                                            loading="lazy"
                                                            decoding="async"
                                                        />
                                                    ) : (
                                                        <span aria-hidden="true">
                                                            {post.title.trim().slice(0, 1) || '文'}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 text-left">
                                                    <span className="line-clamp-2 text-[13px] leading-5 text-ink-soft">
                                                        {post.title}
                                                    </span>
                                                    <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                                                        <Clock3
                                                            className="size-3"
                                                            strokeWidth={1.8}
                                                            aria-hidden="true"
                                                        />
                                                        {post.date}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="search-panel-empty">
                                    {normalized === ''
                                        ? `输入关键词，在「${scope.label}」中搜索。`
                                        : `「${scope.label}」中没有匹配内容。`}
                                </p>
                            )}
                            <button
                                type="button"
                                className="search-panel-all"
                                onClick={() => goToSiteSearch(query.trim())}
                            >
                                <Search className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                <span>搜索全站内容</span>
                                <ArrowUpRight
                                    className="ml-auto size-4"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                            </button>
                        </>
                    ) : normalized !== '' ? (
                        <>
                            <button
                                type="button"
                                className="search-panel-all"
                                onClick={() => void submit()}
                            >
                                <Search className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                <span>
                                    搜索 “<strong>{query.trim()}</strong>”
                                </span>
                                <ArrowUpRight
                                    className="ml-auto size-4"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                            </button>

                            {matchedTerms.length > 0 ? (
                                <div className="search-panel-group">
                                    <p className="search-panel-label">匹配分类与标签</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {matchedTerms.map((term) => (
                                            <button
                                                key={term}
                                                type="button"
                                                className="search-panel-chip"
                                                onClick={() => setQuery(term)}
                                            >
                                                <Hash
                                                    className="size-3"
                                                    strokeWidth={1.8}
                                                    aria-hidden="true"
                                                />
                                                {term}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {matchedRecent.length > 0 ? (
                                <div className="search-panel-group">
                                    <p className="search-panel-label">匹配文章</p>
                                    <div className="search-panel-results">
                                        {matchedRecent.map((post) => (
                                            <button
                                                key={post.url + post.title}
                                                type="button"
                                                className="search-panel-result"
                                                onClick={() => openPost(post.url)}
                                            >
                                                <span className="search-panel-thumb">
                                                    {post.thumb ? (
                                                        <img
                                                            src={post.thumb}
                                                            alt=""
                                                            width={64}
                                                            height={48}
                                                            loading="lazy"
                                                            decoding="async"
                                                        />
                                                    ) : (
                                                        <span aria-hidden="true">
                                                            {post.title.trim().slice(0, 1) || '文'}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 text-left">
                                                    <span className="line-clamp-2 text-[13px] leading-5 text-ink-soft">
                                                        {post.title}
                                                    </span>
                                                    <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                                                        <Clock3
                                                            className="size-3"
                                                            strokeWidth={1.8}
                                                            aria-hidden="true"
                                                        />
                                                        {post.date}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {matchedTerms.length === 0 && matchedRecent.length === 0 ? (
                                <p className="search-panel-empty">
                                    没有本地匹配项，按 Enter 直接搜索全站内容。
                                </p>
                            ) : null}
                        </>
                    ) : (
                        <>
                            {terms.length > 0 ? (
                                <div className="search-panel-group">
                                    <p className="search-panel-label">热门搜索</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {terms.map((term) => (
                                            <button
                                                key={term}
                                                type="button"
                                                className="search-panel-chip"
                                                onClick={() => setQuery(term)}
                                            >
                                                <Hash
                                                    className="size-3"
                                                    strokeWidth={1.8}
                                                    aria-hidden="true"
                                                />
                                                {term}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {recent.length > 0 ? (
                                <div className="search-panel-group">
                                    <p className="search-panel-label">最近更新</p>
                                    <div className="search-panel-results">
                                        {recent.map((post) => (
                                            <button
                                                key={post.url + post.title}
                                                type="button"
                                                className="search-panel-result"
                                                onClick={() => openPost(post.url)}
                                            >
                                                <span className="search-panel-thumb">
                                                    {post.thumb ? (
                                                        <img
                                                            src={post.thumb}
                                                            alt=""
                                                            width={64}
                                                            height={48}
                                                            loading="lazy"
                                                            decoding="async"
                                                        />
                                                    ) : (
                                                        <span aria-hidden="true">
                                                            {post.title.trim().slice(0, 1) || '文'}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 text-left">
                                                    <span className="line-clamp-2 text-[13px] leading-5 text-ink-soft">
                                                        {post.title}
                                                    </span>
                                                    <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                                                        <Clock3
                                                            className="size-3"
                                                            strokeWidth={1.8}
                                                            aria-hidden="true"
                                                        />
                                                        {post.date}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
