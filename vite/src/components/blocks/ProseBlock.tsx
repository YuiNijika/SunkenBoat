import { useEffect, useMemo, useRef } from 'react';
import { parseArticle } from '../../lib/article';
import { Card } from '../ui/card';
import PostMeta from '../content/PostMeta';
import type { PostCategory } from '../../types';

interface Props {
    title: string;
    meta: {
        date: string;
        dateIso: string;
        author: string;
        commentsText: string;
        views: number;
        viewsText: string;
        categories: PostCategory[];
    } | null;
    html: string;
    codeCopy: boolean;
}

/**
 * The body itself is written by the editor, so the React layer only wraps it:
 * heading anchors come from `parseArticle()` and the table of contents is
 * rendered by the sidebar from the same parse result.
 */
export default function ProseBlock({ title, meta, html, codeCopy }: Props) {
    const parsed = useMemo(() => parseArticle(html), [html]);
    const bodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body || !codeCopy) {
            return;
        }

        const cleanups: (() => void)[] = [];

        body.querySelectorAll('pre').forEach((pre) => {
            if (pre.querySelector('.code-copy')) {
                return;
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'code-copy';
            button.textContent = '复制';

            let timer = 0;
            const onClick = async () => {
                const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
                try {
                    await navigator.clipboard.writeText(code);
                    button.textContent = '已复制';
                } catch {
                    button.textContent = '复制失败';
                }

                window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    button.textContent = '复制';
                }, 1600);
            };

            button.addEventListener('click', onClick);
            pre.appendChild(button);
            cleanups.push(() => {
                window.clearTimeout(timer);
                button.removeEventListener('click', onClick);
                button.remove();
            });
        });

        return () => cleanups.forEach((cleanup) => cleanup());
    }, [parsed.html, codeCopy]);

    return (
        <Card className="surface-card gap-0 p-5 sm:p-6">
            {title ? (
                <header className="mb-5 border-b border-line pb-4">
                    <p className="text-[12px] font-normal text-brand">文章</p>
                    <h1 className="mt-2 text-[24px] font-medium leading-[1.4] text-ink sm:text-[28px]">
                        {title}
                    </h1>
                    {meta ? (
                        <div className="mt-3">
                            <PostMeta
                                date={meta.date}
                                dateIso={meta.dateIso}
                                author={meta.author}
                                commentsText={meta.commentsText}
                                views={meta.views}
                                viewsText={meta.viewsText}
                                categories={meta.categories}
                            />
                        </div>
                    ) : null}
                </header>
            ) : null}
            <div
                ref={bodyRef}
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: parsed.html }}
            />
        </Card>
    );
}
