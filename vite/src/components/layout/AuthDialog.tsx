import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import {
    errorMessage,
    profileFrom,
    readPayload,
    requestEmailCode,
} from '../../lib/user';
import type { UserApiEndpoints, UserProfile } from '../../types';

type Mode = 'login' | 'register' | 'reset';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    api: UserApiEndpoints;
    checking: boolean;
    onAuthenticated: (profile: UserProfile) => void;
}

export default function AuthDialog({
    open,
    onOpenChange,
    api,
    checking,
    onAuthenticated,
}: Props) {
    const [mode, setMode] = useState<Mode>('login');
    const [name, setName] = useState('');
    const [mail, setMail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [remember, setRemember] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!open) {
            return;
        }

        setMode('login');
        setName('');
        setMail('');
        setCode('');
        setPassword('');
        setConfirm('');
        setRemember(false);
        setError('');
        setNotice('');
        setCooldown(0);
    }, [open]);

    useEffect(() => {
        if (cooldown <= 0) {
            return;
        }

        const timer = window.setTimeout(() => {
            setCooldown((seconds) => Math.max(0, seconds - 1));
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [cooldown]);

    useEffect(() => {
        if (!api.registerEnabled && mode === 'register') {
            setMode('login');
        }
        if (!api.resetEnabled && mode === 'reset') {
            setMode('login');
        }
    }, [api.registerEnabled, api.resetEnabled, mode]);

    const clearFeedback = () => {
        setError('');
        setNotice('');
    };

    const switchMode = () => {
        clearFeedback();
        setPassword('');
        setConfirm('');
        setCode('');
        setMode((current) => (current === 'login' ? 'register' : 'login'));
    };

    const startReset = () => {
        clearFeedback();
        setPassword('');
        setConfirm('');
        setCode('');
        setMode('reset');
    };

    const backToLogin = () => {
        clearFeedback();
        setPassword('');
        setConfirm('');
        setCode('');
        setMode('login');
    };

    const sendCode = async () => {
        if (sendingCode || cooldown > 0) {
            return;
        }

        if (mail.trim() === '') {
            setError('请先填写邮箱');
            return;
        }

        setSendingCode(true);
        setError('');
        setNotice('');

        try {
            const result = await requestEmailCode(
                api.emailCode,
                mail,
                mode === 'reset' ? 'reset' : 'register'
            );
            setCooldown(result.cooldown);
            setNotice(`验证码已发送，${Math.max(1, Math.ceil(result.expiresIn / 60))} 分钟内有效。`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '验证码发送失败，请稍后再试');
        } finally {
            setSendingCode(false);
        }
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting || checking) {
            return;
        }

        setSubmitting(true);
        setError('');
        setNotice('');

        try {
            if (mode === 'register') {
                if (password !== confirm) {
                    throw new Error('两次输入的密码不一致');
                }
                if (api.registerVerify && code.trim() === '') {
                    throw new Error('请输入邮箱验证码');
                }

                const response = await fetch(api.register, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: name.trim(),
                        mail: mail.trim(),
                        password,
                        ...(api.registerVerify ? { code: code.trim() } : {}),
                    }),
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '注册失败'));
                }

                const profile = profileFrom(payload);
                if (!profile) {
                    throw new Error('注册接口未返回用户信息');
                }

                onAuthenticated(profile);
                onOpenChange(false);
                return;
            }

            if (mode === 'reset') {
                if (password !== confirm) {
                    throw new Error('两次输入的密码不一致');
                }

                const response = await fetch(api.resetPassword, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        mail: mail.trim(),
                        code: code.trim(),
                        password,
                    }),
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '密码重置失败'));
                }

                setName(mail.trim());
                setPassword('');
                setConfirm('');
                setCode('');
                setMode('login');
                setNotice('密码已重置，请使用新密码登录。');
                return;
            }

            const response = await fetch(api.login, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: name.trim(), password, remember }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '用户名或密码无效'));
            }

            const profile = profileFrom(payload);
            if (!profile) {
                throw new Error('登录接口未返回用户信息');
            }

            onAuthenticated(profile);
            onOpenChange(false);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : mode === 'login'
                      ? '登录失败'
                      : mode === 'register'
                        ? '注册失败'
                        : '密码重置失败'
            );
        } finally {
            setSubmitting(false);
        }
    };

    const title = mode === 'login' ? '登录' : mode === 'register' ? '注册' : '找回密码';
    const submittingLabel =
        mode === 'login' ? '登录中…' : mode === 'register' ? '注册中…' : '重置中…';
    const submitLabel =
        mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '重置密码';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[390px] gap-0 rounded-[10px] border-line bg-surface p-0 shadow-pop sm:max-w-[390px]">
                <div className="p-6">
                    <DialogHeader className="mb-5 gap-1.5 text-left">
                        <DialogTitle className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink">
                            {title}
                        </DialogTitle>
                        <span aria-hidden="true" className="mt-1 block h-[2px] w-9 rounded-full bg-brand" />
                        <DialogDescription className="text-[12px] leading-5 text-ink-mute">
                            {mode === 'reset' ? (
                                <>
                                    输入注册邮箱收到的验证码。
                                    <button
                                        type="button"
                                        className="ml-1 font-medium text-brand transition-colors hover:text-brand-strong hover:underline"
                                        onClick={backToLogin}
                                    >
                                        返回登录
                                    </button>
                                </>
                            ) : api.registerEnabled ? (
                                <>
                                    {mode === 'login' ? '没有账号？' : '已有账号？'}
                                    <button
                                        type="button"
                                        className="ml-1 font-medium text-brand transition-colors hover:text-brand-strong hover:underline"
                                        onClick={switchMode}
                                    >
                                        {mode === 'login' ? '立即注册' : '返回登录'}
                                    </button>
                                </>
                            ) : (
                                '使用你的站点账号登录。'
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {checking ? (
                        <div className="grid gap-3" aria-busy="true" aria-label="正在读取登录状态">
                            <div className="h-10 animate-pulse rounded-[6px] bg-surface-2" />
                            <div className="h-10 animate-pulse rounded-[6px] bg-surface-2" />
                            <div className="h-10 animate-pulse rounded-[6px] bg-surface-2" />
                            <span className="text-center text-[12px] text-ink-faint">正在读取登录状态…</span>
                        </div>
                    ) : (
                        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
                            {mode !== 'reset' ? (
                                <label className="grid gap-1.5">
                                    <span className="text-[12px] font-medium text-ink-soft">
                                        {mode === 'login' ? '用户名或邮箱' : '用户名'}
                                    </span>
                                    <Input
                                        className="h-10"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        autoComplete="username"
                                        minLength={mode === 'register' ? 2 : undefined}
                                        maxLength={mode === 'register' ? 32 : undefined}
                                        required
                                    />
                                </label>
                            ) : null}

                            {mode !== 'login' ? (
                                <label className="grid gap-1.5">
                                    <span className="text-[12px] font-medium text-ink-soft">邮箱</span>
                                    <Input
                                        className="h-10"
                                        type="email"
                                        value={mail}
                                        onChange={(event) => setMail(event.target.value)}
                                        autoComplete="email"
                                        maxLength={64}
                                        required
                                    />
                                </label>
                            ) : null}

                            {mode === 'register' && api.registerVerify ? (
                                <div className="grid gap-1.5">
                                    <span className="text-[12px] font-medium text-ink-soft">邮箱验证码</span>
                                    <div className="flex gap-2">
                                        <Input
                                            className="h-10 min-w-0 flex-1"
                                            value={code}
                                            onChange={(event) => setCode(event.target.value)}
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={6}
                                            autoComplete="one-time-code"
                                            required
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 shrink-0 px-3 text-[12px]"
                                            disabled={sendingCode || cooldown > 0 || mail.trim() === ''}
                                            onClick={() => void sendCode()}
                                        >
                                            {cooldown > 0
                                                ? `${cooldown}s 后重发`
                                                : sendingCode
                                                  ? '发送中…'
                                                  : '发送验证码'}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}

                            {mode === 'reset' ? (
                                <div className="grid gap-1.5">
                                    <span className="text-[12px] font-medium text-ink-soft">邮箱验证码</span>
                                    <div className="flex gap-2">
                                        <Input
                                            className="h-10 min-w-0 flex-1"
                                            value={code}
                                            onChange={(event) => setCode(event.target.value)}
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={6}
                                            autoComplete="one-time-code"
                                            required
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 shrink-0 px-3 text-[12px]"
                                            disabled={sendingCode || cooldown > 0 || mail.trim() === ''}
                                            onClick={() => void sendCode()}
                                        >
                                            {cooldown > 0
                                                ? `${cooldown}s 后重发`
                                                : sendingCode
                                                  ? '发送中…'
                                                  : '发送验证码'}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}

                            <label className="grid gap-1.5">
                                <span className="text-[12px] font-medium text-ink-soft">
                                    {mode === 'reset' ? '新密码' : '密码'}
                                </span>
                                <Input
                                    className="h-10"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                    minLength={mode === 'login' ? undefined : 6}
                                    maxLength={mode === 'login' ? undefined : 18}
                                    required
                                />
                            </label>

                            {mode !== 'login' ? (
                                <label className="grid gap-1.5">
                                    <span className="text-[12px] font-medium text-ink-soft">确认密码</span>
                                    <Input
                                        className="h-10"
                                        type="password"
                                        value={confirm}
                                        onChange={(event) => setConfirm(event.target.value)}
                                        autoComplete="new-password"
                                        minLength={6}
                                        maxLength={18}
                                        required
                                    />
                                </label>
                            ) : null}

                            {mode === 'login' ? (
                                <div className="flex items-center justify-between gap-3">
                                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-mute">
                                        <input
                                            type="checkbox"
                                            className="size-3.5 rounded-[2px] accent-brand"
                                            checked={remember}
                                            onChange={(event) => setRemember(event.target.checked)}
                                        />
                                        记住登录
                                    </label>
                                    {api.resetEnabled ? (
                                        <button
                                            type="button"
                                            className="text-[12px] text-ink-mute transition-colors hover:text-brand"
                                            onClick={startReset}
                                        >
                                            忘记密码？
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}

                            {notice ? (
                                <p
                                    className="rounded-[4px] bg-brand-soft px-3 py-2 text-[12px] leading-5 text-brand"
                                    role="status"
                                >
                                    {notice}
                                </p>
                            ) : null}

                            {error ? (
                                <p
                                    className="rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive"
                                    role="alert"
                                >
                                    {error}
                                </p>
                            ) : null}

                            <Button type="submit" className="h-10 w-full" disabled={submitting}>
                                {submitting ? (
                                    <>
                                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                                        {submittingLabel}
                                    </>
                                ) : (
                                    submitLabel
                                )}
                            </Button>
                        </form>
                    )}

                    {!checking && mode === 'login' && api.oauth.enabled ? (
                        <div className="mt-5 border-t border-line pt-5">
                            <p className="text-center text-[12px] text-ink-mute">或使用社交账号登录</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {api.oauth.providers.map((provider) => (
                                    <a
                                        key={provider.id}
                                        href={`${api.oauth.startBase}/${provider.id}/start`}
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-line bg-surface px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
                                    >
                                        {provider.label} 登录
                                    </a>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
