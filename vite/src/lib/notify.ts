import { toast } from 'sonner';

export type NotifyTone = 'success' | 'error' | 'info' | 'warning';

interface FlashNotice {
    tone: NotifyTone;
    message: string;
}

const FLASH_KEY = 'ttdf:flash-notice';

const speak = (tone: NotifyTone, message: string) => {
    if (message.trim() === '') {
        return;
    }

    if (tone === 'success') {
        toast.success(message);
        return;
    }
    if (tone === 'error') {
        toast.error(message);
        return;
    }
    if (tone === 'warning') {
        toast.warning(message);
        return;
    }

    toast.info(message);
};

export const notifySuccess = (message: string) => speak('success', message);
export const notifyError = (message: string) => speak('error', message);
export const notifyInfo = (message: string) => speak('info', message);
export const notifyWarning = (message: string) => speak('warning', message);

export const flashNotify = (tone: NotifyTone, message: string) => {
    if (message.trim() === '') {
        return;
    }

    try {
        window.sessionStorage.setItem(FLASH_KEY, JSON.stringify({ tone, message }));
    } catch {
        // Navigation feedback is optional when storage is unavailable.
    }
};

export const restoreFlashNotify = () => {
    let raw = '';
    try {
        raw = window.sessionStorage.getItem(FLASH_KEY) ?? '';
        if (raw !== '') {
            window.sessionStorage.removeItem(FLASH_KEY);
        }
    } catch {
        return;
    }

    if (raw === '') {
        return;
    }

    try {
        const entry = JSON.parse(raw) as Partial<FlashNotice>;
        const tone = entry.tone;
        if (
            tone === 'success'
            || tone === 'error'
            || tone === 'info'
            || tone === 'warning'
        ) {
            speak(tone, String(entry.message ?? ''));
        }
    } catch {
        // Ignore malformed flash entries.
    }
};
