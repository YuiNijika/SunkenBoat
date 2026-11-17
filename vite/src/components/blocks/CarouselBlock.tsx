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
}

export default function CarouselBlock({ title, slides }: Props) {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        if (!api) {
            return;
        }

        const update = () => setCurrent(api.selectedScrollSnap());
        update();
        api.on('select', update);

        if (slides.length < 2) {
            return () => api.off('select', update);
        }

        const timer = window.setInterval(() => {
            if (!document.hidden) {
                api.scrollNext();
            }
        }, 5600);

        return () => {
            window.clearInterval(timer);
            api.off('select', update);
        };
    }, [api, slides.length]);

    if (slides.length === 0) {
        return null;
    }

    return (
        <section className="surface-card overflow-hidden p-0" aria-label={title || '精选内容'}>
            {title ? (
                <header className="flex items-center justify-between px-5 pt-4 pb-1">
                    <h2 className="text-[15px] font-medium text-ink">{title}</h2>
                    <span className="text-[11px] text-ink-faint">
                        {current + 1} / {slides.length}
                    </span>
                </header>
            ) : null}

            <Carousel setApi={setApi} opts={{ loop: slides.length > 1 }} className="w-full">
                <CarouselContent>
                    {slides.map((slide, index) => {
                        const content = (
                            <div className="relative aspect-[21/9] min-h-[180px] w-full overflow-hidden bg-surface-3 sm:aspect-[21/8]">
                                {slide.image ? (
                                    <img
                                        className="size-full object-cover"
                                        src={slide.image}
                                        alt=""
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="size-full bg-[linear-gradient(135deg,var(--accent-soft),var(--surface-3))]" />
                                )}
                                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,18,22,0.72),rgba(15,18,22,0.18)_58%,transparent)]" />
                                <div className="absolute inset-0 flex max-w-[620px] flex-col justify-end p-5 text-white sm:p-7">
                                    {slide.title ? (
                                        <h3 className="text-[20px] font-medium leading-[1.35] sm:text-[26px]">
                                            {slide.title}
                                        </h3>
                                    ) : null}
                                    {slide.description ? (
                                        <p className="mt-1.5 line-clamp-2 max-w-[520px] text-[13px] leading-[1.7] text-white/78">
                                            {slide.description}
                                        </p>
                                    ) : null}
                                    {slide.url ? (
                                        <span className="mt-3 inline-flex items-center gap-1 text-[12px] text-white/85">
                                            查看详情
                                            <ArrowUpRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        );

                        return (
                            <CarouselItem key={`${slide.image}-${slide.title}-${index}`}>
                                {slide.url ? (
                                    <a className="block" href={slide.url}>
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
                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
                            {slides.map((_, index) => (
                                <span
                                    key={index}
                                    className={
                                        'h-1.5 rounded-full transition-all ' +
                                        (index === current ? 'w-5 bg-white' : 'w-1.5 bg-white/45')
                                    }
                                />
                            ))}
                        </div>
                    </>
                ) : null}
            </Carousel>
        </section>
    );
}
