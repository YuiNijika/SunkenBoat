import { useEffect, useMemo, useRef, useState } from 'react';
import { parseArticle } from '../../lib/article';
import { Card } from '../ui/card';
import ImageLightbox from '../content/ImageLightbox';
import PostMeta from '../content/PostMeta';
import type { LightboxImage } from '../content/ImageLightbox';
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
    const lightboxTrigger = useRef<HTMLImageElement | null>(null);
    const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) {
            return;
        }

        let active = true;
        void import('../../lib/highlight').then(({ highlightCode }) => {
            if (active) {
                highlightCode(body);
            }
        }).catch(() => {
            // Highlighting is progressive; the original code stays readable.
        });

        return () => {
            active = false;
        };
    }, [parsed.html]);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) {
            return;
        }

        const cleanups: (() => void)[] = [];

        body.querySelectorAll('pre').forEach((pre) => {
            if (pre.closest('.code-block') !== null) {
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block';

            const header = document.createElement('div');
            header.className = 'code-block-head';

            const language = document.createElement('span');
            language.className = 'code-block-language';
            language.innerHTML = EYE_ICON;
            const label = document.createElement('span');
            label.textContent = codeLanguage(pre);
            language.appendChild(label);
            header.appendChild(language);

            let button: HTMLButtonElement | null = null;
            let timer = 0;

            if (codeCopy) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'code-copy';
                button.setAttribute('aria-label', '复制代码');
                button.title = '复制代码';
                button.innerHTML = COPY_ICON + CHECK_ICON + ERROR_ICON;

                const onClick = async () => {
                    const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
                    window.clearTimeout(timer);

                    try {
                        await navigator.clipboard.writeText(code);
                        button?.setAttribute('data-state', 'success');
                        button?.setAttribute('aria-label', '代码已复制');
                        button?.setAttribute('title', '代码已复制');
                    } catch {
                        button?.setAttribute('data-state', 'error');
                        button?.setAttribute('aria-label', '复制失败');
                        button?.setAttribute('title', '复制失败');
                    }

                    timer = window.setTimeout(() => {
                        button?.removeAttribute('data-state');
                        button?.setAttribute('aria-label', '复制代码');
                        button?.setAttribute('title', '复制代码');
                    }, 1600);
                };

                button.addEventListener('click', onClick);
                header.appendChild(button);
                cleanups.push(() => {
                    window.clearTimeout(timer);
                    button?.removeEventListener('click', onClick);
                });
            }

            const parent = pre.parentNode;
            if (!parent) {
                return;
            }

            parent.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);

            cleanups.push(() => {
                header.remove();
                if (pre.parentNode === wrapper) {
                    wrapper.parentNode?.insertBefore(pre, wrapper);
                }
                wrapper.remove();
            });
        });

        return () => cleanups.forEach((cleanup) => cleanup());
    }, [parsed.html, codeCopy]);

    useEffect(() => {
        setLightboxIndex(null);
        lightboxTrigger.current = null;
    }, [parsed.html]);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) {
            return;
        }

        const images = Array.from(body.querySelectorAll<HTMLImageElement>('img')).filter(
            (image) => imageSource(image) !== ''
        );
        const entries = images.map((image): LightboxImage => {
            const caption =
                image.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ?? '';

            return {
                src: imageSource(image),
                alt: image.alt.trim(),
                caption,
            };
        });

        setLightboxImages(entries);
        if (images.length === 0) {
            return;
        }

        images.forEach((image) => {
            image.dataset.ttdfLightbox = 'true';
            image.tabIndex = 0;
            image.setAttribute('role', 'button');
            image.setAttribute(
                'aria-label',
                image.alt.trim() !== '' ? `查看大图：${image.alt.trim()}` : '查看正文图片'
            );
            image.setAttribute('aria-haspopup', 'dialog');
        });

        const onClick = (event: MouseEvent) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const image = target.closest('img');
            if (!(image instanceof HTMLImageElement)) {
                return;
            }

            const index = images.indexOf(image);
            if (index < 0) {
                return;
            }

            event.preventDefault();
            lightboxTrigger.current = image;
            setLightboxIndex(index);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const target = event.target;
            if (!(target instanceof HTMLImageElement)) {
                return;
            }

            const index = images.indexOf(target);
            if (index < 0) {
                return;
            }

            event.preventDefault();
            lightboxTrigger.current = target;
            setLightboxIndex(index);
        };

        body.addEventListener('click', onClick);
        body.addEventListener('keydown', onKeyDown);

        return () => {
            body.removeEventListener('click', onClick);
            body.removeEventListener('keydown', onKeyDown);
            images.forEach((image) => {
                delete image.dataset.ttdfLightbox;
                image.removeAttribute('tabindex');
                image.removeAttribute('role');
                image.removeAttribute('aria-label');
                image.removeAttribute('aria-haspopup');
            });
        };
    }, [parsed.html]);

    const closeLightbox = () => {
        setLightboxIndex(null);
        const trigger = lightboxTrigger.current;
        lightboxTrigger.current = null;

        if (trigger?.isConnected) {
            window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
        }
    };

    return (
        <>
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
            <ImageLightbox
                images={lightboxImages}
                index={lightboxIndex}
                onClose={closeLightbox}
                onIndexChange={setLightboxIndex}
            />
        </>
    );
}

function imageSource(image: HTMLImageElement): string {
    return (image.currentSrc || image.getAttribute('src') || image.dataset.src || '').trim();
}

const CODE_LANGUAGE_LABELS: Record<string, string> = {
    bash: 'Shell',
    c: 'C',
    'c++': 'C++',
    cpp: 'C++',
    cs: 'C#',
    csharp: 'C#',
    css: 'CSS',
    diff: 'Diff',
    go: 'Go',
    html: 'HTML',
    java: 'Java',
    javascript: 'JavaScript',
    js: 'JavaScript',
    json: 'JSON',
    markdown: 'Markdown',
    md: 'Markdown',
    php: 'PHP',
    plaintext: 'Text',
    py: 'Python',
    python: 'Python',
    rust: 'Rust',
    sh: 'Shell',
    shell: 'Shell',
    sql: 'SQL',
    text: 'Text',
    ts: 'TypeScript',
    tsx: 'TypeScript',
    typescript: 'TypeScript',
    xml: 'HTML',
    yaml: 'YAML',
    yml: 'YAML',
    zsh: 'Shell',
};

const EYE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 ' +
    '10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';

const COPY_ICON =
    '<svg class="code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'focusable="false"><rect width="14" height="14" x="8" y="8" rx="2"/><path ' +
    'd="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const CHECK_ICON =
    '<svg class="code-copy-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

const ERROR_ICON =
    '<svg class="code-copy-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function codeLanguage(pre: HTMLPreElement): string {
    const className = pre.querySelector('code')?.className ?? '';
    const match = className.match(/(?:^|\s)(?:language|lang)-([a-z0-9+#.-]+)/i);
    if (!match) {
        return 'Code';
    }

    const raw = match[1].toLowerCase();
    return CODE_LANGUAGE_LABELS[raw] ?? raw.toUpperCase();
}
