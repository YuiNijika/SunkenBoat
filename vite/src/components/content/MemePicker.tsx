import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ImageOff,
    LoaderCircle,
    SmilePlus,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { MemeConfig } from '../../types';

export interface MemeItem {
    name: string;
    url: string;
    group: string;
}

interface Props {
    config?: MemeConfig | null;
    onPick: (item: MemeItem) => void;
    disabled?: boolean;
}

function parseManifest(value: unknown): Record<string, MemeItem[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const groups: Record<string, MemeItem[]> = {};
    for (const [group, rows] of Object.entries(value as Record<string, unknown>)) {
        if (!Array.isArray(rows) || /[[\]\r\n]/.test(group) || group.trim() === '') {
            continue;
        }

        const items = rows.flatMap((row): MemeItem[] => {
            if (!row || typeof row !== 'object') {
                return [];
            }

            const item = row as Record<string, unknown>;
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const url = typeof item.url === 'string' ? item.url.trim() : '';

            return name !== ''
                && !/[[\]\r\n]/.test(name)
                && /^https:\/\/i[0-2]\.hdslb\.com\/bfs\/(?:garb|emote)\//i.test(url)
                ? [{ name, url, group }]
                : [];
        });

        if (items.length > 0) {
            groups[group] = items;
        }
    }

    return groups;
}

export function memeShortcode(item: MemeItem): string {
    return `[sunken_meme]${item.group}_${item.name}[/sunken_meme]`;
}

function proxiedUrl(proxy: string, url: string): string {
    try {
        const target = new URL(proxy, window.location.href);
        target.searchParams.set('src', url);
        return target.toString();
    } catch {
        return url;
    }
}

export default function MemePicker({ config, onPick, disabled = false }: Props) {
    const [open, setOpen] = useState(false);
    const [groups, setGroups] = useState<Record<string, MemeItem[]>>({});
    const [active, setActive] = useState('');
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [scrollState, setScrollState] = useState({ left: false, right: false });
    const bodyRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open || !config || loaded) {
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setFailed(false);

        void fetch(config.manifest, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('表情清单加载失败');
                }

                return parseManifest(await response.json());
            })
            .then((result) => {
                const names = Object.keys(result);
                setGroups(result);
                setActive(names[0] ?? '');
                setFailed(names.length === 0);
                setLoaded(true);
            })
            .catch((reason) => {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }
                setFailed(true);
                setLoaded(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [config, loaded, open]);

    const names = useMemo(() => Object.keys(groups), [groups]);
    const activeGroup = useMemo(
        () => (names.includes(active) ? active : names[0] ?? ''),
        [active, names]
    );
    const items = activeGroup === '' ? [] : groups[activeGroup] ?? [];

    const syncGroupScroll = useCallback(() => {
        const strip = stripRef.current;
        if (!strip) {
            return;
        }

        const next = {
            left: strip.scrollLeft > 1,
            right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
        };
        setScrollState((current) =>
            current.left === next.left && current.right === next.right
                ? current
                : next
        );
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const frame = window.requestAnimationFrame(syncGroupScroll);
        window.addEventListener('resize', syncGroupScroll);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', syncGroupScroll);
        };
    }, [names, open, syncGroupScroll]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0 });
    }, [activeGroup]);

    const scrollGroups = (direction: -1 | 1) => {
        const strip = stripRef.current;
        if (!strip) {
            return;
        }

        strip.scrollBy({
            left: direction * Math.max(96, strip.clientWidth * 0.7),
            behavior: 'smooth',
        });
    };

    if (!config) {
        return null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="markdown-toolbar-btn"
                    aria-label="插入表情"
                    title="插入表情"
                    disabled={disabled}
                >
                    <SmilePlus aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="top"
                className="meme-picker w-[min(92vw,392px)] gap-0 border-line bg-surface p-0"
            >
                <div className="meme-picker-title" title={activeGroup || '表情包'}>
                    {activeGroup || '表情包'}
                </div>

                <div className="meme-picker-body" ref={bodyRef}>
                    {loading ? (
                        <div className="meme-picker-state" aria-busy="true">
                            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                            正在加载表情…
                        </div>
                    ) : failed ? (
                        <div className="meme-picker-state">
                            <ImageOff className="size-5" aria-hidden="true" />
                            表情清单暂时不可用
                        </div>
                    ) : (
                        <div className="meme-picker-grid" role="tabpanel">
                            {items.map((item) => (
                                <button
                                    key={`${item.name}-${item.url}`}
                                    type="button"
                                    className="meme-picker-item"
                                    title={item.name}
                                    aria-label={`插入表情：${item.name}`}
                                    onClick={() => {
                                        onPick(item);
                                        setOpen(false);
                                    }}
                                >
                                    <img
                                        src={proxiedUrl(config.proxy, item.url)}
                                        alt={item.name}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {names.length > 0 ? (
                    <div className="meme-picker-footer">
                        <div
                            className="meme-picker-group-strip"
                            ref={stripRef}
                            role="tablist"
                            aria-label="表情分组"
                            onScroll={syncGroupScroll}
                        >
                            {names.map((name) => {
                                const preview = groups[name]?.[0];
                                return (
                                    <button
                                        key={name}
                                        type="button"
                                        role="tab"
                                        aria-selected={name === activeGroup}
                                        aria-label={name}
                                        title={name}
                                        className={
                                            name === activeGroup
                                                ? 'meme-picker-group is-active'
                                                : 'meme-picker-group'
                                        }
                                        onClick={() => setActive(name)}
                                    >
                                        {preview ? (
                                            <img
                                                src={proxiedUrl(config.proxy, preview.url)}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <SmilePlus
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="meme-picker-arrows">
                            <button
                                type="button"
                                className="meme-picker-arrow"
                                aria-label="上一组表情"
                                disabled={!scrollState.left}
                                onClick={() => scrollGroups(-1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="meme-picker-arrow"
                                aria-label="下一组表情"
                                disabled={!scrollState.right}
                                onClick={() => scrollGroups(1)}
                            >
                                <ChevronRight aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                ) : null}
            </PopoverContent>
        </Popover>
    );
}
