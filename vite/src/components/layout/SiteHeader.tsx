import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Languages, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../lib/theme';
import { onSearchOpen } from '../../lib/search';
import { changeTranslation, prepareTranslation } from '../../lib/translate';
import { Button } from '../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import SearchPanel from './SearchPanel';
import UserCenter from './UserCenter';
import type { ApiEndpoints, NavItem, SearchScope, SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    colorMode: string;
    widgets: WidgetsData;
    api?: ApiEndpoints;
    showUserCenter: boolean;
}

function navClass(item: NavItem): string {
    return (
        'relative inline-flex h-[50px] items-center rounded-[4px] px-2.5 text-[15px] font-normal transition-colors ' +
        (item.active
            ? 'text-brand before:absolute before:inset-x-0 before:top-0 before:h-[5px] before:rounded-b-[15px] before:bg-brand before:opacity-100'
            : 'text-ink-soft hover:text-brand hover:before:absolute hover:before:inset-x-0 hover:before:top-0 hover:before:h-[5px] hover:before:rounded-b-[15px] hover:before:bg-brand hover:before:opacity-100')
    );
}

export default function SiteHeader({ site, colorMode, widgets, api, showUserCenter }: Props) {
    const { theme, toggle } = useTheme(colorMode);
    const location = useLocation();
    const headerRef = useRef<HTMLElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchScope, setSearchScope] = useState<SearchScope | null>(null);
    const [language, setLanguage] = useState('');
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
        if (!site.translate.enabled) {
            return;
        }

        let active = true;
        void prepareTranslation(site.translate).then(() => {
            if (!active) {
                return;
            }
            try {
                setLanguage(window.localStorage.getItem('ttdf:translate-language') ?? '');
            } catch {
                setLanguage('');
            }
        });

        return () => {
            active = false;
        };
    }, [site.translate]);

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

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
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

                <nav className="hidden h-[52px] flex-1 items-stretch lg:flex" aria-label="主导航">
                    <ul className="ml-5 flex h-full items-stretch">
                        {site.nav.map((item) => (
                            <li key={item.url + item.label} className="group/nav relative flex">
                                <a
                                    className={navClass(item)}
                                    href={item.url}
                                    aria-current={item.active ? 'page' : undefined}
                                    aria-haspopup={item.children?.length ? 'true' : undefined}
                                >
                                    {item.label}
                                    {item.children?.length ? (
                                        <ChevronDown
                                            className="ml-1 size-3.5 transition-transform group-hover/nav:rotate-180"
                                            strokeWidth={1.8}
                                            aria-hidden="true"
                                        />
                                    ) : null}
                                </a>
                                {item.children?.length ? (
                                    <ul className="invisible absolute top-full left-0 z-50 min-w-[180px] translate-y-1 rounded-[6px] border border-line bg-surface p-1.5 opacity-0 shadow-pop transition-all group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100">
                                        {item.children.map((child) => (
                                            <li key={child.url + child.label}>
                                                <a
                                                    className={
                                                        'block rounded-[4px] px-3 py-2 text-[13px] transition-colors ' +
                                                        (child.active
                                                            ? 'bg-brand-soft text-brand'
                                                            : 'text-ink-soft hover:bg-surface-2 hover:text-brand')
                                                    }
                                                    href={child.url}
                                                    aria-current={child.active ? 'page' : undefined}
                                                >
                                                    {child.label}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="ml-auto flex items-center gap-1">
                    {site.translate.enabled ? (
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 rounded-[4px] text-ink-mute hover:bg-[rgba(136,136,136,0.1)] hover:text-ink-soft"
                                    aria-label="切换页面语言"
                                    title="切换页面语言"
                                >
                                    <Languages strokeWidth={1.8} aria-hidden="true" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                sideOffset={8}
                                className="w-44 border-line bg-surface p-1.5"
                            >
                                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-ink-faint">
                                    页面语言
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-line" />
                                <DropdownMenuItem
                                    className="cursor-pointer px-2 py-1.5 text-[12px]"
                                    onSelect={() => {
                                        setLanguage('');
                                        try {
                                            window.localStorage.removeItem('ttdf:translate-language');
                                        } catch {
                                            // Translation still works without storage.
                                        }
                                        changeTranslation(site.translate.local);
                                    }}
                                >
                                    <span className="flex-1">原文</span>
                                    {language === '' ? (
                                        <Check className="size-3.5 text-brand" strokeWidth={2} />
                                    ) : null}
                                </DropdownMenuItem>
                                {site.translate.languages.map((item) => (
                                    <DropdownMenuItem
                                        key={item.code}
                                        className="cursor-pointer px-2 py-1.5 text-[12px]"
                                        onSelect={() => {
                                            setLanguage(item.code);
                                            try {
                                                window.localStorage.setItem(
                                                    'ttdf:translate-language',
                                                    item.code
                                                );
                                            } catch {
                                                // Translation still works without storage.
                                            }
                                            changeTranslation(item.code);
                                        }}
                                    >
                                        <span className="flex-1">{item.label}</span>
                                        {language === item.code ? (
                                            <Check className="size-3.5 text-brand" strokeWidth={2} />
                                        ) : null}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
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

            {menuOpen && typeof document !== 'undefined'
                ? createPortal(
                <div className="mobile-drawer lg:hidden" role="dialog" aria-modal="true" aria-label="移动导航">
                    <button
                        type="button"
                        className="mobile-drawer-backdrop"
                        aria-label="关闭导航菜单"
                        onClick={() => setMenuOpen(false)}
                    />
                    <nav id="ttdf-mobile-nav" className="mobile-drawer-panel" aria-label="移动导航">
                        <div className="mobile-drawer-head">
                            <div className="min-w-0">
                                <p className="section-label">Navigation</p>
                                <p className="mt-1 truncate text-[16px] font-medium text-ink">
                                    {title}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-9 rounded-[6px] text-ink-mute"
                                aria-label="关闭导航菜单"
                                onClick={() => setMenuOpen(false)}
                            >
                                <X strokeWidth={1.8} aria-hidden="true" />
                            </Button>
                        </div>
                        <ul className="mobile-drawer-list">
                            {site.nav.map((item) => (
                                <li key={item.url + item.label}>
                                    <a
                                        className={
                                            'mobile-drawer-link ' +
                                            (item.active ? 'is-active' : '')
                                        }
                                        href={item.url}
                                        aria-current={item.active ? 'page' : undefined}
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        <span>{item.label}</span>
                                        {item.children?.length ? (
                                            <ChevronDown
                                                className="size-4 rotate-[-90deg] text-ink-faint"
                                                strokeWidth={1.8}
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                    </a>
                                    {item.children?.length ? (
                                        <ul className="mobile-drawer-children">
                                            {item.children.map((child) => (
                                                <li key={child.url + child.label}>
                                                    <a
                                                        className={
                                                            'mobile-drawer-child ' +
                                                            (child.active ? 'is-active' : '')
                                                        }
                                                        href={child.url}
                                                        aria-current={
                                                            child.active ? 'page' : undefined
                                                        }
                                                        onClick={() => setMenuOpen(false)}
                                                    >
                                                        {child.label}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                        <div className="mobile-drawer-foot">
                            <a className="mobile-drawer-home" href={site.url}>
                                返回首页
                            </a>
                            {site.subtitle ? (
                                <p className="mt-2 text-[11px] leading-5 text-ink-faint">
                                    {site.subtitle}
                                </p>
                            ) : null}
                        </div>
                    </nav>
                </div>,
                document.body
            )
                : null}

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
