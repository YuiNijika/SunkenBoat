import { useEffect, useRef, useState } from 'react';
import { Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../lib/theme';
import { onSearchOpen } from '../../lib/search';
import { Button } from '../ui/button';
import SearchPanel from './SearchPanel';
import UserCenter from './UserCenter';
import DesktopNav from './navigation/DesktopNav';
import HeaderLanguageMenu from './navigation/HeaderLanguageMenu';
import MobileNavDrawer from './navigation/MobileNavDrawer';
import type { ApiEndpoints, SearchScope, SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    colorMode: string;
    widgets: WidgetsData;
    api?: ApiEndpoints;
    showUserCenter: boolean;
}

export default function SiteHeader({ site, colorMode, widgets, api, showUserCenter }: Props) {
    const { theme, toggle } = useTheme(colorMode);
    const location = useLocation();
    const headerRef = useRef<HTMLElement>(null);
    const drawerRef = useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchScope, setSearchScope] = useState<SearchScope | null>(null);
    const title = site.title || 'SunkenBoat';
    const showTitle = site.showTitle !== false || !site.logo;

    useEffect(
        () =>
            onSearchOpen((scope) => {
                setSearchScope(scope);
                setSearchOpen(true);
            }),
        []
    );

    useEffect(() => {
        setMenuOpen(false);
        setSearchOpen(false);
        setSearchScope(null);
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (searchOpen) {
            setMenuOpen(false);
        }
    }, [searchOpen]);

    useEffect(() => {
        if (!searchOpen) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSearchOpen(false);
            }
        };
        const onPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && headerRef.current?.contains(event.target)) {
                return;
            }
            setSearchOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [searchOpen]);

    useEffect(() => {
        if (!menuOpen) {
            return;
        }

        const previousFocus = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusableInDrawer = (): HTMLElement[] => {
            const panel = drawerRef.current?.querySelector<HTMLElement>('.mobile-drawer-panel');
            if (!panel) {
                return [];
            }

            return Array.from(
                panel.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter((element) => element.getClientRects().length > 0);
        };

        const frame = window.requestAnimationFrame(() => {
            focusableInDrawer()[0]?.focus();
        });

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const focusable = focusableInDrawer();
            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            window.cancelAnimationFrame(frame);
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
            previousFocus?.focus();
        };
    }, [menuOpen]);

    return (
        <header
            ref={headerRef}
            className="sticky top-0 z-40 mb-5 bg-surface/80 backdrop-blur-xl"
        >
            <div className="container-page flex min-h-[68px] items-center gap-3 py-2">
                <a className="flex min-w-0 shrink-0 items-center gap-2.5" href={site.url}>
                    {site.logo ? (
                        <img
                            className="size-9 shrink-0 rounded-[4px] object-cover"
                            src={site.logo}
                            alt=""
                            width={36}
                            height={36}
                        />
                    ) : (
                        <span
                            className="grid size-9 shrink-0 place-items-center rounded-[4px] bg-brand text-[15px] font-medium text-brand-contrast"
                            aria-hidden="true"
                        >
                            {title.slice(0, 1)}
                        </span>
                    )}
                    {showTitle ? (
                        <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium leading-5 text-ink">
                                {title}
                            </span>
                            {site.subtitle ? (
                                <span className="hidden max-w-44 truncate text-[11px] leading-4 text-ink-mute sm:block">
                                    {site.subtitle}
                                </span>
                            ) : null}
                        </span>
                    ) : null}
                </a>

                <DesktopNav items={site.nav} />

                <div className="ml-auto flex items-center gap-1">
                    <HeaderLanguageMenu translate={site.translate} />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-[4px] text-ink-mute hover:bg-[rgba(136,136,136,0.1)] hover:text-ink-soft"
                        aria-label={searchOpen ? '关闭搜索' : '打开搜索'}
                        aria-expanded={searchOpen}
                        aria-controls="ttdf-search-panel"
                        onClick={() => {
                            setSearchScope(null);
                            setSearchOpen((open) => !open);
                        }}
                    >
                        <Search strokeWidth={1.8} aria-hidden="true" />
                    </Button>
                    <UserCenter api={api?.user} show={showUserCenter} site={site} />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-[4px] text-ink-mute hover:bg-[rgba(136,136,136,0.1)] hover:text-ink-soft"
                        aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                        aria-pressed={theme === 'dark'}
                        onClick={toggle}
                    >
                        {theme === 'dark' ? <Sun strokeWidth={1.8} /> : <Moon strokeWidth={1.8} />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-[4px] text-ink-mute hover:bg-[rgba(136,136,136,0.1)] hover:text-ink-soft lg:hidden"
                        aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
                        aria-expanded={menuOpen}
                        aria-controls="ttdf-mobile-nav"
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        {menuOpen ? <X strokeWidth={1.8} /> : <Menu strokeWidth={1.8} />}
                    </Button>

                </div>
            </div>

            {menuOpen ? (
                <MobileNavDrawer
                    site={site}
                    title={title}
                    drawerRef={drawerRef}
                    onClose={() => setMenuOpen(false)}
                />
            ) : null}

            {searchOpen ? (
                <SearchPanel
                    site={site}
                    widgets={widgets}
                    scope={searchScope}
                    onClose={() => setSearchOpen(false)}
                />
            ) : null}
        </header>
    );
}
