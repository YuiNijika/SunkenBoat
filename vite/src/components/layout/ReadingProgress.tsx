import { useEffect, useRef, useState } from 'react';

export default function ReadingProgress() {
    const barRef = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let frame = 0;
        const measure = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const max = document.documentElement.scrollHeight - window.innerHeight;
                const value = max > 0 ? (window.scrollY / max) * 100 : 0;
                const next = Math.min(100, Math.max(0, value));
                setProgress(next);
                setVisible(max > 0 && window.scrollY > 0);
                barRef.current?.style.setProperty('--reading-progress', String(next / 100));
            });
        };

        measure();
        window.addEventListener('scroll', measure, { passive: true });
        window.addEventListener('resize', measure);
        window.addEventListener('load', measure);

        const observer = new ResizeObserver(measure);
        observer.observe(document.body);

        void document.fonts?.ready.then(measure);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', measure);
            window.removeEventListener('resize', measure);
            window.removeEventListener('load', measure);
            observer.disconnect();
        };
    }, []);

    return (
        <div
            ref={barRef}
            className={visible ? 'reading-progress is-visible' : 'reading-progress'}
            aria-hidden="true"
            data-progress={Math.round(progress)}
        >
            <span />
        </div>
    );
}
