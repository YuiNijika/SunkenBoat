import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    type CarouselApi,
} from '../ui/carousel';
import type { CarouselSlide } from '../../types';

interface Props {
    title: string;
    slides: CarouselSlide[];
    width?: 'content' | 'half' | 'full';
    height?: '' | 'sm' | 'md' | 'lg' | 'screen';
    overlay?: number;
    align?: 'left' | 'center';
}

const AUTOPLAY_DELAY = 5600;

export default function CarouselBlock({
    title,
    slides,
    width = 'content',
    height = '',
    overlay = 45,
    align = 'center',
}: Props) {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        if (!api) {
            return;
        }

        const update = () => setCurrent(api.selectedScrollSnap());
        const onPointerDown = () => setDragging(true);
        const onPointerUp = () => setDragging(false);
        update();
        api.on('select', update);
        api.on('pointerDown', onPointerDown);
        api.on('pointerUp', onPointerUp);

        return () => {
            api.off('select', update);
            api.off('pointerDown', onPointerDown);
            api.off('pointerUp', onPointerUp);
        };
    }, [api]);

    useEffect(() => {
        if (!api || slides.length < 2 || dragging) {
            return;
        }

        const timer = window.setInterval(() => {
            if (!document.hidden) {
                api.scrollNext();
            }
        }, AUTOPLAY_DELAY);

        return () => window.clearInterval(timer);
    }, [api, dragging, slides.length]);

    if (slides.length === 0) {
        return null;
    }

    return (
        <section
            className={[
                'carousel-shell surface-card overflow-hidden p-0',
                `is-${width}`,
                height !== '' ? `is-height-${height}` : '',
                `is-align-${align}`,
            ]
                .filter(Boolean)
                .join(' ')}
            aria-label={title || '精选内容'}
            data-width={width}
        >
            {title ? (
                <header className="carousel-head">
                    <h2>{title}</h2>
                    <span>
                        {current + 1} / {slides.length}
                    </span>
                </header>
            ) : null}

            <Carousel
                setApi={setApi}
                opts={{
                    loop: slides.length > 1,
                    containScroll: 'trimSnaps',
                    dragFree: false,
                }}
                className="w-full"
            >
                <CarouselContent className="cursor-grab select-none active:cursor-grabbing">
                    {slides.map((slide, index) => {
                        const content = (
                            <div className="carousel-slide">
                                {slide.image ? (
                                    <img
                                        className="size-full object-cover"
                                        src={slide.image}
                                        alt=""
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                        decoding="async"
                                        draggable={false}
                                    />
                                ) : (
                                    <div className="carousel-placeholder" />
                                )}
                                <div
                                    className="carousel-shade"
                                    style={{ opacity: Math.max(0, Math.min(90, overlay)) / 100 }}
                                />
                                <div className="carousel-copy">
                                    {slide.title ? <h3>{slide.title}</h3> : null}
                                    {slide.description ? <p>{slide.description}</p> : null}
                                    {slide.url ? (
                                        <span>
                                            查看详情
                                            <ArrowUpRight
                                                className="size-3.5"
                                                strokeWidth={1.8}
                                                aria-hidden="true"
                                            />
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        );

                        return (
                            <CarouselItem key={`${slide.image}-${slide.title}-${index}`}>
                                {slide.url ? (
                                    <a className="block" href={slide.url} draggable={false}>
                                        {content}
                                    </a>
                                ) : (
                                    content
                                )}
                            </CarouselItem>
                        );
                    })}
                </CarouselContent>

                {slides.length > 1 ? (
                    <>
                        <CarouselPrevious className="left-3 border-0 bg-black/35 text-white hover:bg-black/50 hover:text-white" />
                        <CarouselNext className="right-3 border-0 bg-black/35 text-white hover:bg-black/50 hover:text-white" />
                        <div className="carousel-dots">
                            {slides.map((slide, index) => (
                                <button
                                    key={`${slide.title}-${index}`}
                                    type="button"
                                    className={index === current ? 'is-active' : ''}
                                    aria-label={`切换到第 ${index + 1} 张`}
                                    aria-current={index === current ? 'true' : undefined}
                                    onClick={() => api?.scrollTo(index)}
                                />
                            ))}
                        </div>
                    </>
                ) : null}
            </Carousel>
        </section>
    );
}
