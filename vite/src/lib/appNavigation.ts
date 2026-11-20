interface NavigationDetail {
    href?: string;
}

export function navigateApp(href: string): void {
    if (href.trim() === '') {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<NavigationDetail>('ttdf:navigate', {
            detail: { href },
        })
    );
}

export function refreshApp(href = ''): void {
    window.dispatchEvent(
        new CustomEvent<NavigationDetail>('ttdf:refresh', {
            detail: { href },
        })
    );
}
