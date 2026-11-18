import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';

export interface LightboxImage {
    src: string;
    alt: string;
    caption: string;
}

interface Props {
    images: LightboxImage[];
    index: number | null;
    onClose: () => void;
    onIndexChange: (index: number) => void;
}

export default function ImageLightbox({ images, index, onClose, onIndexChange }: Props) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const open = index !== null && index >= 0 && index < images.length;

    useEffect(() => {
        if (!open) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus({ preventScroll: true });

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open || index === null) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (images.length < 2) {
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                onIndexChange((index - 1 + images.length) % images.length);
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                onIndexChange((index + 1) % images.length);
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [images.length, index, onClose, onIndexChange, open]);

    if (!open || index === null) {
        return null;
    }

    const image = images[index];
    const multiple = images.length > 1;
    const previous = () => onIndexChange((index - 1 + images.length) % images.length);
    const next = () => onIndexChange((index + 1) % images.length);

    return createPortal(
        <div
            className="article-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={image.alt !== '' ? `查看图片：${image.alt}` : '查看正文图片'}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <button
                ref={closeRef}
                type="button"
                className="article-lightbox-btn article-lightbox-close"
                aria-label="关闭图片预览"
                onClick={onClose}
            >
                <X aria-hidden="true" />
            </button>

            {multiple ? (
                <button
                    type="button"
                    className="article-lightbox-btn article-lightbox-prev"
                    aria-label="上一张图片"
                    onClick={previous}
                >
                    <ChevronLeft aria-hidden="true" />
                </button>
            ) : null}

            <figure className="article-lightbox-figure" onMouseDown={(event) => event.stopPropagation()}>
                <img src={image.src} alt={image.alt} draggable={false} />
                <figcaption>
                    {image.caption || image.alt ? (
                        <p>{image.caption || image.alt}</p>
                    ) : (
                        <span aria-hidden="true" />
                    )}
                    <div className="article-lightbox-meta">
                        {multiple ? (
                            <span>
                                {index + 1} / {images.length}
                            </span>
                        ) : null}
                        <a href={image.src} target="_blank" rel="noreferrer">
                            <ExternalLink aria-hidden="true" />
                            查看原图
                        </a>
                    </div>
                </figcaption>
            </figure>

            {multiple ? (
                <button
                    type="button"
                    className="article-lightbox-btn article-lightbox-next"
                    aria-label="下一张图片"
                    onClick={next}
                >
                    <ChevronRight aria-hidden="true" />
                </button>
            ) : null}
        </div>,
        document.body
    );
}
