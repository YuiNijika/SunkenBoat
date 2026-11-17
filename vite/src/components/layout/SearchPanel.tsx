import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '../ui/command';
import type { SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    widgets: WidgetsData;
    onClose: () => void;
}

export default function SearchPanel({ site, widgets, onClose }: Props) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');

    const focusInput = () => {
        document.querySelector<HTMLInputElement>('#ttdf-search-panel [cmdk-input]')?.focus();
    };

    useEffect(() => {
        focusInput();
    }, []);

    const submit = (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        const value = query.trim();
        if (value === '') {
            focusInput();
            return;
        }

        onClose();
        const target = new URL(site.url, window.location.origin);
        target.searchParams.set('s', value);
        navigate(target.pathname + target.search);
    };

    const openPost = (url: string) => {
        onClose();
        const target = new URL(url, window.location.origin);
        navigate(target.pathname + target.search + target.hash);
    };

    const terms = Array.from(
        new Set([
            ...widgets.tags.map((tag) => tag.label),
            ...widgets.categories.map((category) => category.label),
        ])
    )
        .filter((term) => term.trim() !== '')
        .slice(0, 14);
    const recent = widgets.recent.slice(0, 4);

    return (
        <div
            id="ttdf-search-panel"
            className="search-panel absolute inset-x-0 top-full z-50 border-t border-line bg-surface shadow-card"
        >
            <div className="mx-auto w-full max-w-[1380px] px-5 py-4 sm:py-5">
                <Command
                    shouldFilter={false}
                    className="overflow-hidden rounded-none border-0 bg-transparent shadow-none"
                >
                        <form
                            className="flex items-center gap-2 border-b border-line px-3 [&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]]:flex-1 [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:px-0"
                            role="search"
                            onSubmit={submit}
                        >
                            <CommandInput
                                className="h-12 text-[15px]"
                                value={query}
                                onValueChange={setQuery}
                                placeholder="搜索文章、分类或标签…"
                                aria-label="搜索关键词"
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <Button type="submit" size="sm" className="h-9 shrink-0 rounded-md px-4">
                                搜索
                            </Button>
                        </form>

                        <CommandList className="max-h-[min(60vh,520px)] overscroll-contain p-2">
                            {query.trim() !== '' ? (
                                <CommandGroup heading="搜索">
                                    <CommandItem
                                        value={`search-${query}`}
                                        onSelect={() => submit()}
                                        className="gap-2.5 rounded-lg px-3 py-2.5"
                                    >
                                        <Search
                                            className="size-4 text-ink-mute"
                                            strokeWidth={1.8}
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 truncate">搜索 “{query.trim()}”</span>
                                    </CommandItem>
                                </CommandGroup>
                            ) : null}

                            {terms.length > 0 ? (
                                <CommandGroup
                                    heading="热门搜索"
                                    className="flex flex-wrap gap-1.5 [&_[cmdk-group-heading]]:w-full [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:pb-2"
                                >
                                    {terms.map((term) => (
                                        <CommandItem
                                            key={term}
                                            value={term}
                                            onSelect={() => {
                                                setQuery(term);
                                                focusInput();
                                            }}
                                            className="w-auto rounded-full border border-line bg-surface-2 px-3 py-1 text-[12px] text-ink-soft"
                                        >
                                            {term}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ) : null}

                            {recent.length > 0 ? (
                                <CommandGroup heading="热门文章">
                                    {recent.map((post) => (
                                        <CommandItem
                                            key={post.url + post.title}
                                            value={`${post.title} ${post.url}`}
                                            onSelect={() => openPost(post.url)}
                                            className="gap-3 rounded-lg px-2.5 py-2"
                                        >
                                            <span className="relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-3">
                                                {post.thumb ? (
                                                    <img
                                                        className="size-full object-cover"
                                                        src={post.thumb}
                                                        alt=""
                                                        width={64}
                                                        height={48}
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                ) : (
                                                    <span className="text-[13px] text-brand/60" aria-hidden="true">
                                                        {post.title.trim().slice(0, 1) || '文'}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="line-clamp-2 text-[13px] leading-5 text-ink-soft">
                                                    {post.title}
                                                </span>
                                                <span className="mt-1 block text-[11px] text-ink-faint">
                                                    {post.date}
                                                </span>
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ) : null}

                            <CommandEmpty>没有匹配的内容，按 Enter 直接搜索。</CommandEmpty>
                        </CommandList>
                </Command>
            </div>
        </div>
    );
}
