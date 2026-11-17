import { useEffect, useState } from 'react';
import { ArrowUp, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { openSearch } from '../../lib/search';

interface Props {
    colorMode: string;
}

/**
 * Sticky shortcut column that mirrors the shortcuts visitors expect from long
 * reading pages: search, colour mode and back to top.
 */
export default function ActionRail({ colorMode }: Props) {
    const { theme, toggle } = useTheme(colorMode);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 240);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="fixed right-4 top-1/3 z-30 hidden flex-col gap-2 xl:flex">
            <button
                type="button"
                className="rail-btn"
                aria-label="搜索"
                title="搜索文章"
                onClick={openSearch}
            >
                <Search className="size-4" strokeWidth={1.8} />
            </button>

            <button
                type="button"
                className="rail-btn"
                aria-label="切换深浅色"
                aria-pressed={theme === 'dark'}
                title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                onClick={toggle}
            >
                {theme === 'dark' ? (
                    <Sun className="size-4" strokeWidth={1.8} />
                ) : (
                    <Moon className="size-4" strokeWidth={1.8} />
                )}
            </button>

            <button
                type="button"
                className={
                    'rail-btn transition-opacity duration-200 ' +
                    (visible ? 'opacity-100' : 'pointer-events-none opacity-0')
                }
                aria-label="回到顶部"
                aria-hidden={!visible}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
                <ArrowUp className="size-4" strokeWidth={1.8} />
            </button>
        </div>
    );
}
