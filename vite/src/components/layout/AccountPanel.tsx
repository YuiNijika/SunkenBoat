import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
    BadgeCheck,
    Camera,
    ExternalLink,
    FileText,
    KeyRound,
    Link2,
    LoaderCircle,
    Mail,
    Newspaper,
    ShieldCheck,
    Unlink,
    UserCheck,
    UserRound,
} from 'lucide-react';
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
import type {
    OAuthProvider,
    UserApiEndpoints,
    UserCertification,
    UserEconomySummary,
    UserProfile,
} from '../../types';
import { notifyError, notifySuccess } from '../../lib/notify';
import { refreshApp } from '../../lib/appNavigation';
import { cssUrl } from '../../lib/css';
import { loadSession } from '../../lib/session';
import ContentManager from './ContentManager';
import AuthDialog from './AuthDialog';
import UserAvatar from './UserAvatar';
import UserCenterShell from './UserCenterShell';
import type { AccountNavGroup, AccountSection } from './UserCenterShell';
import DownloadHistory from '../content/DownloadHistory';
import MediaLibrary from '../content/MediaLibrary';
import CaptchaDialog from './CaptchaDialog';
import type { CaptchaValue } from './CaptchaField';

type Status = 'loading' | 'guest' | 'ready' | 'error';

interface Props {
    api?: UserApiEndpoints;
    section?: AccountSection;
}

interface ProfileDetails {
    avatar: string;
    background: string;
    signature: string;
    gender: string;
    privacy: string;
    location: string;
}

const EMPTY_DETAILS: ProfileDetails = {
    avatar: '',
    background: '',
    signature: '',
    gender: 'secret',
    privacy: 'public',
    location: '',
};

const GENDER_LABELS: Record<string, string> = {
    secret: '保密',
    male: '男',
    female: '女',
    other: '其他',
};

const PRIVACY_LABELS: Record<string, string> = {
    public: '所有人可见',
    members: '仅登录用户可见',
    private: '仅自己可见',
};

const OAUTH_ERRORS: Record<string, string> = {
    oauth_disabled: '站点尚未开放该社交账号登录。',
    oauth_denied: '你取消了社交账号授权。',
    oauth_state: '授权状态已过期，请重新发起登录。',
    oauth_failed: '社交账号授权失败，请稍后重试。',
    oauth_rate_limited: '授权失败次数过多，请稍后再试。',
    oauth_bound: '该社交账号已绑定到其他用户。',
    oauth_unbound: '该社交账号尚未绑定，请先登录后到用户中心绑定。',
};

type AccountFeedback = {
    tone: 'success' | 'error';
    message: string;
} | null;

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            (url.protocol === 'http:' || url.protocol === 'https:')
            && url.username === ''
            && url.password === ''
        );
    } catch {
        return false;
    }
}

function detailsFromProfile(profile: UserProfile): ProfileDetails {
    return {
        avatar: profile.customAvatar ?? '',
        background: profile.background ?? '',
        signature: profile.signature ?? '',
        gender: profile.gender || 'secret',
        privacy: profile.privacy || 'public',
        location: profile.location ?? '',
    };
}

function certificationFrom(value: unknown): UserCertification | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const item = value as Partial<UserCertification>;
    const status = String(item.status ?? 'none');
    if (!['none', 'pending', 'approved', 'rejected'].includes(status)) {
        return null;
    }

    return {
        status,
        type: String(item.type ?? ''),
        name: String(item.name ?? ''),
        note: String(item.note ?? ''),
        reason: String(item.reason ?? ''),
        submitted: Number.isFinite(Number(item.submitted)) ? Math.max(0, Number(item.submitted)) : 0,
        reviewed: Number.isFinite(Number(item.reviewed)) ? Math.max(0, Number(item.reviewed)) : 0,
    };
}

function ProfileAvatar({ profile, className }: { profile: UserProfile; className: string }) {
    const [failed, setFailed] = useState(false);
    const initial = (profile.screenName || profile.name || '用').slice(0, 1);
    const base = className + ' grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-brand';

    if (!profile.avatar || failed) {
        return <span className={base + ' text-[18px] font-medium'}>{initial}</span>;
    }

    return (
        <span className={base}>
            <img
                className="size-full object-cover"
                src={profile.avatar}
                alt=""
                width={72}
                height={72}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
            />
        </span>
    );
}

export default function AccountPanel({ api, section = 'profile' }: Props) {
    const [status, setStatus] = useState<Status>(
        api?.enabled && api?.authenticated ? 'loading' : 'guest'
    );
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [authOpen, setAuthOpen] = useState(false);
    const [screenName, setScreenName] = useState('');
    const [url, setUrl] = useState('');
    const [mail, setMail] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileBusy, setProfileBusy] = useState(false);
    const [mailBusy, setMailBusy] = useState(false);
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [details, setDetails] = useState<ProfileDetails>(EMPTY_DETAILS);
    const [detailsReady, setDetailsReady] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>(
        api?.oauth?.providers ?? []
    );
    const [oauthBusy, setOauthBusy] = useState('');
    const [avatarMediaOpen, setAvatarMediaOpen] = useState(false);
    const [backgroundMediaOpen, setBackgroundMediaOpen] = useState(false);
    const [backgroundBusy, setBackgroundBusy] = useState(false);
    const [certification, setCertification] = useState<UserCertification | null>(null);
    const [certType, setCertType] = useState<'personal' | 'organization'>('personal');
    const [certName, setCertName] = useState('');
    const [certNote, setCertNote] = useState('');
    const [certBusy, setCertBusy] = useState(false);
    const [certDetailsOpen, setCertDetailsOpen] = useState(false);
    const [economy, setEconomy] = useState<UserEconomySummary | null>(null);
    const [checkinCaptcha, setCheckinCaptcha] = useState<CaptchaValue | null>(null);
    const [checkinCaptchaOpen, setCheckinCaptchaOpen] = useState(false);
    const [checkinBusy, setCheckinBusy] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [feedback, setFeedback] = useState<AccountFeedback>(null);

    const sessionEndpoint = api?.session;
    const meEndpoint = api?.me;
    const location = useLocation();

    const clearFeedback = () => {
        setFeedback(null);
    };

    const clearFieldError = (field: string) => {
        setFieldErrors((current) => {
            if (!current[field]) {
                return current;
            }

            const next = { ...current };
            delete next[field];
            return next;
        });
    };

    const reportFieldError = (field: string, message: string) => {
        setFieldErrors({ [field]: message });
        window.requestAnimationFrame(() => {
            document
                .querySelector<HTMLElement>(`[data-account-field="${field}"]`)
                ?.focus();
        });
    };

    useEffect(() => {
        setOauthProviders(api?.oauth?.providers ?? []);
    }, [api?.oauth]);

    useEffect(() => {
        if (status !== 'ready' || !api?.economy?.summary) {
            return;
        }
        let active = true;
        void fetch(api.economy.summary, {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Typecho-Token': api.economy.nonce,
            },
        })
            .then((response) => readPayload(response))
            .then((payload) => {
                const data = (payload?.data as { economy?: UserEconomySummary } | undefined)
                    ?.economy;
                if (active && data) {
                    setEconomy(data);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [status, api?.economy?.summary, profile?.uid]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const result = params.get('oauth');
        const error = params.get('oauth_error');

        if (result === 'bound') {
            notifySuccess('社交账号已绑定。');
        } else if (result === 'login') {
            notifySuccess('已通过社交账号登录。');
        }

        if (error) {
            notifyError(OAUTH_ERRORS[error] ?? '社交账号授权失败。');
        }
    }, [location.search]);

    useEffect(() => {
        if (!api?.enabled || !sessionEndpoint || !meEndpoint) {
            setStatus('guest');
            return;
        }

        let active = true;
        setStatus(api.authenticated ? 'loading' : 'guest');
        setLoadError('');

        void loadSession(api).then((result) => {
            if (!active) {
                return;
            }

            if (result.status === 'guest') {
                setProfile(null);
                setStatus('guest');
                return;
            }

            if (result.status === 'error') {
                setLoadError(result.message || '读取账号信息失败');
                setStatus('error');
                return;
            }

            setProfile(result.profile);
            setScreenName(result.profile.screenName);
            setUrl(result.profile.url ?? '');
            setMail(result.profile.mail ?? '');
            setDetails(detailsFromProfile(result.profile));
            setCertification(result.profile.certification ?? null);
            setDetailsReady(api.profile !== '');
            setStatus('ready');
        });

        return () => {
            active = false;
        };
    }, [
        api?.authenticated,
        api?.enabled,
        api?.enhanced,
        api?.profile,
        api?.profileNonce,
        meEndpoint,
        sessionEndpoint,
    ]);

    useEffect(() => {
        if (cooldown <= 0) {
            return;
        }

        const timer = window.setTimeout(() => {
            setCooldown((seconds) => Math.max(0, seconds - 1));
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [cooldown]);

    const syncProfile = (next: UserProfile) => {
        setProfile((current) => ({
            ...next,
            avatar: next.avatar || current?.avatar || '',
        }));
        setScreenName(next.screenName);
        setUrl(next.url ?? '');
        setMail(next.mail ?? '');
        if (api?.enhanced) {
            setDetails(detailsFromProfile(next));
        }
        if (next.certification) {
            setCertification(next.certification);
        }
        setStatus('ready');
    };

    const hydrateProfile = async (next: UserProfile) => {
        syncProfile(next);

        if (!api?.profile || !api.profileNonce) {
            return;
        }

        try {
            const response = await fetch(api.profile, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Typecho-Token': api.profileNonce,
                },
            });
            if (!response.ok) {
                return;
            }

            const detailed = profileFrom(await readPayload(response));
            if (detailed) {
                syncProfile(detailed);
            }
        } catch {
            // Keep the login response when the optional profile endpoint fails.
        }
    };

    const saveDetails = async (
        nextDetails: ProfileDetails = details
    ): Promise<UserProfile | null> => {
        if (!api?.profile || !api.profileNonce) {
            throw new Error('增强资料接口不可用');
        }

        const response = await fetch(api.profile, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Typecho-Token': api.profileNonce,
            },
            body: JSON.stringify(nextDetails),
        });
        const payload = await readPayload(response);
        if (!response.ok) {
            throw new Error(errorMessage(payload, '更多资料保存失败'));
        }

        return profileFrom(payload);
    };

    const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!meEndpoint || profileBusy) {
            return;
        }

        setFeedback(null);
        setFieldErrors({});

        if (screenName.trim() === '') {
            reportFieldError('screen-name', '显示名称不能为空。');
            return;
        }

        if (url.trim() !== '' && !isHttpUrl(url.trim())) {
            reportFieldError('profile-url', '请输入完整的 http(s) 个人主页地址。');
            return;
        }

        if (details.avatar.trim() !== '' && !isHttpUrl(details.avatar.trim())) {
            reportFieldError('profile-avatar', '头像地址必须是完整的 http(s) 链接。');
            return;
        }

        if (details.background.trim() !== '' && !isHttpUrl(details.background.trim())) {
            reportFieldError('profile-background', '背景图地址必须是完整的 http(s) 链接。');
            return;
        }

        setProfileBusy(true);

        try {
            const response = await fetch(meEndpoint, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    screenName: screenName.trim(),
                    url: url.trim(),
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '资料保存失败'));
            }

            let updated = profileFrom(payload);
            if (!updated) {
                throw new Error('接口未返回更新后的用户信息');
            }

            if (api?.enhanced && detailsReady) {
                const detailed = await saveDetails();
                if (detailed) {
                    updated = detailed;
                }
            }

            syncProfile(updated);
            setFeedback({ tone: 'success', message: '个人资料已保存，公开主页会同步更新。' });
            notifySuccess('个人资料已更新。');
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '资料保存失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setProfileBusy(false);
        }
    };

    const saveBackground = async (nextDetails: ProfileDetails) => {
        if (!detailsReady) {
            notifyError('更多资料尚未加载完成，请稍后再试');
            return;
        }
        if (!api?.profile || !api.profileNonce || backgroundBusy) {
            return;
        }

        const previous = details;
        setFeedback(null);
        setBackgroundBusy(true);
        try {
            const updated = await saveDetails(nextDetails);
            if (!updated) {
                throw new Error('接口未返回更新后的资料');
            }
            syncProfile(updated);
            setFeedback({ tone: 'success', message: '个人主页背景已更新。' });
            notifySuccess('个人主页背景已更新。');
        } catch (reason) {
            setDetails(previous);
            const message = reason instanceof Error ? reason.message : '背景图保存失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setBackgroundBusy(false);
        }
    };

    const unbindOAuth = async (provider: OAuthProvider) => {
        if (!api?.oauth?.enabled || oauthBusy !== '') {
            return;
        }

        setOauthBusy(provider.id);
        setFeedback(null);

        try {
            const response = await fetch(api.oauth.unbind, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.oauth.nonce,
                },
                body: JSON.stringify({ provider: provider.id }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '解绑失败'));
            }

            const next = payload?.data as { oauth?: { providers?: OAuthProvider[] } } | undefined;
            const providers = next?.oauth?.providers;
            if (Array.isArray(providers)) {
                setOauthProviders(providers);
            } else {
                setOauthProviders((current) =>
                    current.map((item) =>
                        item.id === provider.id
                            ? { ...item, bound: false, name: '', avatar: '', boundAt: 0 }
                            : item
                    )
                );
            }
            setFeedback({
                tone: 'success',
                message: `${provider.label} 已解绑，后续不能再使用该平台登录。`,
            });
            notifySuccess(`${provider.label} 已解绑。`);
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '解绑失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setOauthBusy('');
        }
    };

    const sendEmailCode = async () => {
        if (!api || sendingCode || cooldown > 0) {
            return;
        }

        const nextMail = mail.trim();
        if (nextMail === '') {
            reportFieldError('account-mail', '请先填写新邮箱。');
            return;
        }

        setSendingCode(true);

        try {
            const result = await requestEmailCode(api.emailCode, nextMail, 'email');
            setCooldown(result.cooldown);
            setFeedback({
                tone: 'success',
                message: `验证码已发送至 ${nextMail}，请在有效期内完成验证。`,
            });
            notifySuccess(
                `验证码已发送至新邮箱，${Math.max(1, Math.ceil(result.expiresIn / 60))} 分钟内有效。`
            );
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '验证码发送失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setSendingCode(false);
        }
    };

    const saveMail = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api || !meEndpoint || mailBusy) {
            return;
        }

        setFeedback(null);
        setFieldErrors({});
        const nextMail = mail.trim();
        if (nextMail === '') {
            reportFieldError('account-mail', '邮箱不能为空。');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextMail)) {
            reportFieldError('account-mail', '请输入有效的邮箱地址。');
            return;
        }

        if (profile && nextMail.toLowerCase() === profile.mail?.toLowerCase()) {
            reportFieldError('account-mail', '新邮箱不能与当前邮箱相同。');
            return;
        }

        if (api.emailVerify && emailCode.trim() === '') {
            reportFieldError('email-code', '请输入发送到新邮箱的验证码。');
            return;
        }

        setMailBusy(true);

        try {
            const response = await fetch(meEndpoint, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mail: nextMail,
                    ...(api.emailVerify ? { emailCode: emailCode.trim() } : {}),
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '邮箱更新失败'));
            }

            const updated = profileFrom(payload);
            if (!updated) {
                throw new Error('接口未返回更新后的用户信息');
            }

            syncProfile(updated);
            setEmailCode('');
            setFeedback({ tone: 'success', message: '登录邮箱已更新。' });
            notifySuccess('登录邮箱已更新。');
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '邮箱更新失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setMailBusy(false);
        }
    };

    const savePassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api || passwordBusy) {
            return;
        }

        setFeedback(null);
        setFieldErrors({});
        if (currentPassword === '') {
            reportFieldError('current-password', '请输入当前密码。');
            return;
        }

        if (newPassword !== confirmPassword) {
            reportFieldError('confirm-password', '两次输入的新密码不一致。');
            return;
        }

        if (newPassword.length < 6 || newPassword.length > 18) {
            reportFieldError('new-password', '新密码长度需为 6–18 个字符。');
            return;
        }

        setPasswordBusy(true);

        try {
            const response = await fetch(api.password, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ currentPassword, password: newPassword }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '密码修改失败'));
            }

            const updated = profileFrom(payload);
            if (updated) {
                syncProfile(updated);
            }

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setFeedback({
                tone: 'success',
                message: '密码已修改，其他设备上的旧登录凭证已失效。',
            });
            notifySuccess('密码已修改，其他设备上的旧登录凭证已失效。');
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '密码修改失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setPasswordBusy(false);
        }
    };

    const logout = async () => {
        if (!api || loggingOut) {
            return;
        }

        setLoggingOut(true);

        try {
            const response = await fetch(api.logout, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ all: false }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '退出登录失败'));
            }

            setProfile(null);
            setStatus('guest');
            notifySuccess('已退出登录。');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '退出登录失败');
        } finally {
            setLoggingOut(false);
        }
    };

    const submitCertification = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api?.certification || !api.certificationNonce || certBusy) {
            return;
        }
        setFeedback(null);
        setFieldErrors({});
        if (certName.trim().length < 2) {
            reportFieldError('cert-name', '请填写真实姓名或组织名称。');
            return;
        }
        if (certNote.trim() === '') {
            reportFieldError('cert-note', '请填写认证说明。');
            return;
        }

        setCertBusy(true);
        try {
            const response = await fetch(api.certification, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.certificationNonce,
                },
                body: JSON.stringify({
                    op: 'submit',
                    type: certType,
                    name: certName.trim(),
                    note: certNote.trim(),
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '认证申请提交失败'));
            }

            const data = payload?.data as { certification?: unknown; message?: unknown } | undefined;
            const next = certificationFrom(data?.certification);
            if (next) {
                setCertification(next);
            }
            const message =
                typeof data?.message === 'string' && data.message !== ''
                    ? data.message
                    : '认证申请已提交，请等待管理员审核。';
            setFeedback({ tone: 'success', message });
            notifySuccess(message);
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : '认证申请提交失败';
            setFeedback({ tone: 'error', message });
            notifyError(message);
        } finally {
            setCertBusy(false);
        }
    };

    if (!api?.enabled) {
        const centerEnabled = api?.centerEnabled === true;
        const apiReady = api?.apiReady === true;
        const title = centerEnabled ? '账号服务尚未就绪' : '账号服务未启用';
        const description = centerEnabled
            ? apiReady
                ? '账号服务正在初始化，请稍后重新加载页面。'
                : api?.admin
                  ? '前台用户中心已开启，但 REST v2 接口尚未开启。请到“设置外观 → 运行&扩展 → 接口&安全”开启 REST v2 后重试。'
                  : '站点正在配置前台账号服务，请稍后再试或联系管理员。'
            : '站点暂未开放前台账号服务，请联系管理员。';

        return (
            <div className="user-center-state">
                <p className="section-label">Account</p>
                <h1>{title}</h1>
                <p>
                    {description}
                </p>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="user-center-state user-center-state-loading" aria-busy="true">
                <div className="user-center-state-heading">
                    <span />
                    <span />
                </div>
                <div className="user-center-state-grid">
                    <div />
                    <div />
                    <div />
                </div>
                <span className="sr-only">正在读取账号信息…</span>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="user-center-state user-center-state-error">
                <p className="section-label">Account</p>
                <h1>无法读取账号信息</h1>
                <p>{loadError}</p>
                <Button type="button" variant="secondary" onClick={() => refreshApp()}>
                    重新加载
                </Button>
            </div>
        );
    }

    if (status === 'guest' || !profile) {
        return (
            <>
                <div className="user-center-state user-center-guest-state">
                    <span className="user-center-state-icon">
                        <UserRound className="size-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <h1>登录后管理账号</h1>
                    <p>
                        登录后可管理个人资料、账号安全和社交账号。
                    </p>
                    <Button type="button" onClick={() => setAuthOpen(true)}>
                        登录 / 注册
                    </Button>
                    {loadError ? (
                        <p className="mt-3 text-[12px] leading-5 text-destructive" role="alert">
                            {loadError}
                        </p>
                    ) : null}
                </div>
                <AuthDialog
                    open={authOpen}
                    onOpenChange={setAuthOpen}
                    api={api}
                    checking={false}
                    onAuthenticated={(next) => {
                        void hydrateProfile(next);
                    }}
                />
            </>
        );
    }

    const avatarPreview: UserProfile = {
        ...profile,
        avatar: details.avatar || profile.avatar,
        customAvatar: details.avatar,
    };
    const coverUrl = details.background || profile.background || '';
    const pageUrls = api.pages;
    const spaceUrl = `${pageUrls.space.replace(/\/+$/, '')}/${profile.uid}`;
    const forumLabel = api.forum?.label || '圈子';

    const runCheckin = async (captchaValue: CaptchaValue | null) => {
        if (checkinBusy || !api.economy?.checkin) {
            return;
        }
        setCheckinBusy(true);
        try {
            const response = await fetch(api.economy.checkin, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.economy.nonce,
                },
                body: JSON.stringify(captchaValue ? { captcha: captchaValue } : {}),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '签到失败'));
            }
            const next = (payload?.data as { economy?: UserEconomySummary } | undefined)
                ?.economy;
            if (next) {
                setEconomy(next);
            }
            setCheckinCaptcha(null);
            setCheckinCaptchaOpen(false);
            notifySuccess('签到成功，奖励已到账。');
        } catch (reason) {
            setCheckinCaptcha(null);
            notifyError(reason instanceof Error ? reason.message : '签到失败');
        } finally {
            setCheckinBusy(false);
        }
    };

    const checkinCaptchaRequired = Boolean(
        api.captcha?.enabled && api.captcha.scenes.includes('checkin')
    );

    const checkin = () => {
        if (checkinBusy || !api.economy?.checkin) {
            return;
        }
        if (checkinCaptchaRequired && !checkinCaptcha) {
            setCheckinCaptchaOpen(true);
            return;
        }
        void runCheckin(checkinCaptcha);
    };

    const socialCount = oauthProviders.filter((provider) => provider.bound).length;
    const contentEnabled =
        profile.canWrite || api.forum?.canPost === true || api.forum?.canCreateCircle === true;
    const navGroups: AccountNavGroup[] = [
        {
            label: '账户',
            items: [
                {
                    id: 'profile' as const,
                    href: pageUrls.profile,
                    label: '个人资料',
                    description: '公开身份、头像与隐私',
                    icon: <UserRound strokeWidth={1.8} aria-hidden="true" />,
                },
                {
                    id: 'security' as const,
                    href: pageUrls.account,
                    label: '登录与安全',
                    description: '邮箱、密码与登录凭证',
                    icon: <ShieldCheck strokeWidth={1.8} aria-hidden="true" />,
                },
            ],
        },
        {
            label: '内容与资产',
            items: [
                ...(contentEnabled
                    ? [{
                          id: 'content' as const,
                          href: pageUrls.content,
                          label: '内容工作台',
                          description: `文章、${forumLabel}与评论`,
                          icon: <Newspaper strokeWidth={1.8} aria-hidden="true" />,
                      }]
                    : []),
                ...(api.downloads.enabled
                    ? [{
                          id: 'downloads' as const,
                          href: pageUrls.downloads,
                          label: '订单与下载',
                          description: '购买记录与资源下载',
                          icon: <FileText strokeWidth={1.8} aria-hidden="true" />,
                      }]
                    : []),
            ],
        },
        {
            label: '登录方式',
            items: api.oauth?.enabled
                ? [{
                      id: 'social' as const,
                      href: pageUrls.social,
                      label: '社交账号',
                      description: socialCount > 0 ? `已绑定 ${socialCount} 个平台` : '绑定第三方登录',
                      icon: <Link2 strokeWidth={1.8} aria-hidden="true" />,
                      count: socialCount > 0 ? socialCount : undefined,
                  }]
                : [],
        },
    ].filter((group) => group.items.length > 0);

    const sectionTitles: Record<AccountSection, { title: string; description: string }> = {
        profile: {
            title: '个人资料',
            description: '设置你在站点内公开显示的身份与个人主页信息。',
        },
        security: {
            title: '登录与安全',
            description: '管理登录邮箱和密码；修改会同步失效其他设备上的旧凭证。',
        },
        social: {
            title: '社交账号',
            description: '连接可信第三方账号，之后可直接使用对应平台登录。',
        },
        content: {
            title: '内容工作台',
            description: `集中处理文章、${forumLabel}帖子、${forumLabel}和互动记录。`,
        },
        downloads: {
            title: '订单与下载',
            description: '核对免费领取、付费订单、支付状态和资源下载。',
        },
    };

    return (
        <>
        <UserCenterShell
            active={section}
            api={api}
            coverUrl={coverUrl}
            economy={economy}
            loggingOut={loggingOut}
            navGroups={navGroups}
            onCheckin={checkin}
            onCertificationClick={() => setCertDetailsOpen(true)}
            onLogout={() => void logout()}
            pageDescription={sectionTitles[section].description}
            pageTitle={sectionTitles[section].title}
            profile={profile}
            spaceUrl={spaceUrl}
            checkinBusy={checkinBusy}
        >
            <div className="user-center-content-card">
                {feedback ? (
                    <div
                        className={`user-center-feedback is-${feedback.tone}`}
                        role={feedback.tone === 'error' ? 'alert' : 'status'}
                        aria-live="polite"
                    >
                        <span>{feedback.message}</span>
                        <button type="button" onClick={clearFeedback}>
                            关闭
                        </button>
                    </div>
                ) : null}
                {loadError ? (
                    <p className="user-center-feedback is-error" role="alert">
                        {loadError}
                    </p>
                ) : null}
                        {section === 'profile' ? (
                            <>
                            <form
                                className="user-center-form"
                                noValidate
                                onSubmit={(event) => void saveProfile(event)}
                            >
                                <div className="user-center-form-intro">
                                    <h3>公开资料</h3>
                                    <p>这些信息会显示在公开主页和站点互动区域。</p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="user-center-field">
                                        <span className="text-[12px] font-medium text-ink-soft">显示名称</span>
                                        <Input
                                            id="account-screen-name"
                                            name="screenName"
                                            className="h-10"
                                            value={screenName}
                                            onChange={(event) => {
                                                setScreenName(event.target.value);
                                                clearFieldError('screen-name');
                                            }}
                                            maxLength={150}
                                            autoComplete="nickname"
                                            spellCheck={false}
                                            data-account-field="screen-name"
                                            aria-invalid={Boolean(fieldErrors['screen-name'])}
                                            aria-describedby={
                                                fieldErrors['screen-name']
                                                    ? 'account-screen-name-error'
                                                    : undefined
                                            }
                                        />
                                        {fieldErrors['screen-name'] ? (
                                            <small
                                                id="account-screen-name-error"
                                                className="user-center-field-error"
                                            >
                                                {fieldErrors['screen-name']}
                                            </small>
                                        ) : null}
                                    </label>
                                    {api.enhanced ? (
                                        <label className="user-center-field">
                                            <span className="text-[12px] font-medium text-ink-soft">个性签名</span>
                                            <Input
                                                id="account-signature"
                                                name="signature"
                                                className="h-10"
                                                value={details.signature}
                                                onChange={(event) =>
                                                    setDetails((current) => ({
                                                        ...current,
                                                        signature: event.target.value,
                                                    }))
                                                }
                                                maxLength={120}
                                                placeholder="一句话介绍自己"
                                                autoComplete="off"
                                            />
                                        </label>
                                    ) : null}
                                </div>
                                {api.enhanced ? (
                                    <>
                                        <div className="grid gap-2">
                                            <span className="text-[12px] font-medium text-ink-soft">头像</span>
                                            <div className="user-center-media-field">
                                                <ProfileAvatar
                                                    profile={avatarPreview}
                                                    className="size-14 border border-line shadow-sm"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[12px] text-ink-soft">
                                                        {details.avatar
                                                            ? '已选择自定义头像'
                                                            : '当前使用站点头像源'}
                                                    </p>
                                                    <p className="mt-0.5 text-[11px] leading-5 text-ink-faint">
                                                        头像图片上传到媒体库，保存后立即生效。
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 flex-wrap items-center gap-1">
                                                    <Button
                                                        id="account-avatar"
                                                        name="avatar"
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={!api.avatarMediaEnabled}
                                                        onClick={() => setAvatarMediaOpen(true)}
                                                        data-account-field="profile-avatar"
                                                    >
                                                        从媒体库选择
                                                    </Button>
                                                </div>
                                            </div>
                                            {fieldErrors['profile-avatar'] ? (
                                                <small className="user-center-field-error">
                                                    {fieldErrors['profile-avatar']}
                                                </small>
                                            ) : null}
                                            {!api.avatarMediaEnabled ? (
                                                <span className="text-[11px] leading-5 text-ink-faint">
                                                    媒体库接口未启用，暂时无法更换头像。
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-2">
                                            <span className="text-[12px] font-medium text-ink-soft">
                                                个人主页背景
                                            </span>
                                            <div className="user-center-media-field">
                                                <span
                                                    className="account-cover-thumb shrink-0"
                                                    style={
                                                        details.background !== ''
                                                            ? {
                                                                  backgroundImage: cssUrl(
                                                                      details.background
                                                                  ),
                                                              }
                                                            : undefined
                                                    }
                                                    aria-hidden="true"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[12px] text-ink-soft">
                                                        {details.background
                                                            ? '已设置个人主页背景'
                                                            : '使用站点默认渐变背景'}
                                                    </p>
                                                    <p className="mt-0.5 text-[11px] leading-5 text-ink-faint">
                                                        背景会显示在用户中心与个人空间的顶部横幅。
                                                    </p>
                                                </div>
                                                <Button
                                                    id="account-background"
                                                    name="background"
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={
                                                        !api.avatarMediaEnabled
                                                        || !detailsReady
                                                        || backgroundBusy
                                                    }
                                                    onClick={() => setBackgroundMediaOpen(true)}
                                                    data-account-field="profile-background"
                                                >
                                                    <Camera aria-hidden="true" />
                                                    {backgroundBusy ? '保存中…' : '从媒体库选择'}
                                                </Button>
                                            </div>
                                            {fieldErrors['profile-background'] ? (
                                                <small className="user-center-field-error">
                                                    {fieldErrors['profile-background']}
                                                </small>
                                            ) : null}
                                            {!api.avatarMediaEnabled ? (
                                                <span className="text-[11px] leading-5 text-ink-faint">
                                                    媒体库接口未启用，暂时无法更换背景。
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">性别</span>
                                                <select
                                                    id="account-gender"
                                                    name="gender"
                                                    className="h-10 rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                    value={details.gender}
                                                    onChange={(event) =>
                                                        setDetails((current) => ({
                                                            ...current,
                                                            gender: event.target.value,
                                                        }))
                                                    }
                                                >
                                                    {Object.entries(GENDER_LABELS).map(([value, label]) => (
                                                        <option key={value} value={value}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">隐私设置</span>
                                                <select
                                                    id="account-privacy"
                                                    name="privacy"
                                                    className="h-10 rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                    value={details.privacy}
                                                    onChange={(event) =>
                                                        setDetails((current) => ({
                                                            ...current,
                                                            privacy: event.target.value,
                                                        }))
                                                    }
                                                >
                                                    {Object.entries(PRIVACY_LABELS).map(([value, label]) => (
                                                        <option key={value} value={value}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">居住地</span>
                                                <Input
                                                    id="account-location"
                                                    name="location"
                                                    className="h-10"
                                                    value={details.location}
                                                    onChange={(event) =>
                                                        setDetails((current) => ({
                                                            ...current,
                                                            location: event.target.value,
                                                        }))
                                                    }
                                                    maxLength={64}
                                                    placeholder="例如：广东 深圳"
                                                    autoComplete="address-level2"
                                                />
                                            </label>
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">个人主页</span>
                                                <Input
                                                    id="account-profile-url"
                                                    name="url"
                                                    className="h-10"
                                                    type="url"
                                                    value={url}
                                                    onChange={(event) => {
                                                        setUrl(event.target.value);
                                                        clearFieldError('profile-url');
                                                    }}
                                                    maxLength={255}
                                                    placeholder="https://example.com"
                                                    autoComplete="url"
                                                    inputMode="url"
                                                    spellCheck={false}
                                                    data-account-field="profile-url"
                                                    aria-invalid={Boolean(fieldErrors['profile-url'])}
                                                    aria-describedby={
                                                        fieldErrors['profile-url']
                                                            ? 'account-profile-url-error'
                                                            : undefined
                                                    }
                                                />
                                                {fieldErrors['profile-url'] ? (
                                                    <small
                                                        id="account-profile-url-error"
                                                        className="user-center-field-error"
                                                    >
                                                        {fieldErrors['profile-url']}
                                                    </small>
                                                ) : null}
                                            </label>
                                        </div>
                                    </>
                                ) : (
                                    <label className="user-center-field">
                                        <span className="text-[12px] font-medium text-ink-soft">个人主页</span>
                                        <Input
                                            id="account-profile-url"
                                            name="url"
                                            className="h-10"
                                            type="url"
                                            value={url}
                                            onChange={(event) => {
                                                setUrl(event.target.value);
                                                clearFieldError('profile-url');
                                            }}
                                            maxLength={255}
                                            placeholder="https://example.com"
                                            autoComplete="url"
                                            inputMode="url"
                                            spellCheck={false}
                                            data-account-field="profile-url"
                                            aria-invalid={Boolean(fieldErrors['profile-url'])}
                                            aria-describedby={
                                                fieldErrors['profile-url']
                                                    ? 'account-profile-url-error'
                                                    : undefined
                                            }
                                        />
                                        {fieldErrors['profile-url'] ? (
                                            <small
                                                id="account-profile-url-error"
                                                className="user-center-field-error"
                                            >
                                                {fieldErrors['profile-url']}
                                            </small>
                                        ) : null}
                                    </label>
                                )}
                                {api.enhanced && !detailsReady ? (
                                    <p className="rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive">
                                        更多资料尚未加载完成，保存按钮已暂时禁用。请刷新页面重试。
                                    </p>
                                ) : null}
                                <div>
                                    <Button
                                        type="submit"
                                        disabled={profileBusy || (api.enhanced && !detailsReady)}
                                    >
                                        {profileBusy ? (
                                            <>
                                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                保存中…
                                            </>
                                        ) : (
                                            '保存资料'
                                        )}
                                    </Button>
                                </div>
                            </form>
                            {api.certificationEnabled ? (
                                <section className="mt-6 rounded-[8px] border border-line bg-surface-2 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[14px] font-medium">
                                                <UserCheck
                                                    className="size-4 text-ink-mute"
                                                    strokeWidth={1.8}
                                                    aria-hidden="true"
                                                />
                                                身份认证
                                            </h4>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                提交真实身份或组织信息，管理员审核通过后会在个人空间展示认证徽章。
                                            </p>
                                        </div>
                                        <span
                                            className={
                                                'chip ' +
                                                (certification?.status === 'approved'
                                                    ? 'border-status-info-line bg-status-info-soft text-status-info'
                                                    : certification?.status === 'pending'
                                                      ? 'border-status-warning-line bg-status-warning-soft text-status-warning'
                                                      : certification?.status === 'rejected'
                                                        ? 'border-status-danger-line bg-status-danger-soft text-status-danger'
                                                        : '')
                                            }
                                        >
                                            <BadgeCheck className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                            {certification?.status === 'approved'
                                                ? '已认证'
                                                : certification?.status === 'pending'
                                                  ? '审核中'
                                                  : certification?.status === 'rejected'
                                                    ? '未通过'
                                                    : '未认证'}
                                        </span>
                                    </div>

                                    {certification?.status === 'approved' ? (
                                        <div className="mt-4 rounded-[6px] border border-line bg-surface px-3 py-3 text-[12px] leading-5 text-ink-soft">
                                            <p className="font-medium text-ink">
                                                {certification.name || '已认证用户'}
                                            </p>
                                            <p className="mt-0.5 text-ink-mute">
                                                {certification.type === 'organization'
                                                    ? '组织认证'
                                                    : '个人认证'}
                                                {certification.reviewed > 0
                                                    ? ` · ${new Date(certification.reviewed * 1000).toLocaleDateString()}`
                                                    : ''}
                                            </p>
                                        </div>
                                    ) : null}

                                    {certification?.status === 'pending' ? (
                                        <p className="mt-4 rounded-[6px] border border-line bg-surface px-3 py-3 text-[12px] leading-5 text-ink-mute">
                                            申请已提交，管理员审核后会在个人空间展示认证徽章。
                                        </p>
                                    ) : null}

                                    {certification?.status === 'rejected' ? (
                                        <p className="mt-4 rounded-[6px] border border-status-danger-line bg-status-danger-soft px-3 py-3 text-[12px] leading-5 text-status-danger">
                                            认证未通过
                                            {certification.reason !== ''
                                                ? `：${certification.reason}`
                                                : '，请补充材料后重新提交。'}
                                        </p>
                                    ) : null}

                                    {certification?.status !== 'approved' && certification?.status !== 'pending' ? (
                                        <form
                                            className="mt-4 grid gap-3"
                                            noValidate
                                            onSubmit={(event) => void submitCertification(event)}
                                        >
                                            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                                                <label className="user-center-field">
                                                    <span className="text-[12px] font-medium text-ink-soft">认证类型</span>
                                                    <select
                                                        id="account-certification-type"
                                                        name="certificationType"
                                                        className="h-10 rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                        value={certType}
                                                        onChange={(event) =>
                                                            setCertType(
                                                                event.target.value === 'organization'
                                                                    ? 'organization'
                                                                    : 'personal'
                                                            )
                                                        }
                                                    >
                                                        <option value="personal">个人认证</option>
                                                        <option value="organization">组织认证</option>
                                                    </select>
                                                </label>
                                                <label className="user-center-field">
                                                    <span className="text-[12px] font-medium text-ink-soft">
                                                        {certType === 'organization' ? '组织名称' : '真实姓名'}
                                                    </span>
                                                    <Input
                                                        id="account-certification-name"
                                                        name="certificationName"
                                                        className="h-10"
                                                        value={certName}
                                                        onChange={(event) => {
                                                            setCertName(event.target.value);
                                                            clearFieldError('cert-name');
                                                        }}
                                                        maxLength={64}
                                                        placeholder={
                                                            certType === 'organization'
                                                                ? '例如：SunkenBoat Studio'
                                                                : '例如：张三'
                                                        }
                                                        autoComplete="name"
                                                        data-account-field="cert-name"
                                                        aria-invalid={Boolean(fieldErrors['cert-name'])}
                                                        aria-describedby={
                                                            fieldErrors['cert-name']
                                                                ? 'account-certification-name-error'
                                                                : undefined
                                                        }
                                                    />
                                                    {fieldErrors['cert-name'] ? (
                                                        <small
                                                            id="account-certification-name-error"
                                                            className="user-center-field-error"
                                                        >
                                                            {fieldErrors['cert-name']}
                                                        </small>
                                                    ) : null}
                                                </label>
                                            </div>
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">认证说明</span>
                                                <textarea
                                                    id="account-certification-note"
                                                    name="certificationNote"
                                                    className="min-h-[88px] rounded-[4px] border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                    value={certNote}
                                                    onChange={(event) => {
                                                        setCertNote(event.target.value);
                                                        clearFieldError('cert-note');
                                                    }}
                                                    maxLength={500}
                                                    placeholder="请填写认证依据、个人主页或其他可核验信息"
                                                    data-account-field="cert-note"
                                                    aria-invalid={Boolean(fieldErrors['cert-note'])}
                                                    aria-describedby={
                                                        fieldErrors['cert-note']
                                                            ? 'account-certification-note-error'
                                                            : undefined
                                                    }
                                                />
                                                {fieldErrors['cert-note'] ? (
                                                    <small
                                                        id="account-certification-note-error"
                                                        className="user-center-field-error"
                                                    >
                                                        {fieldErrors['cert-note']}
                                                    </small>
                                                ) : null}
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <Button type="submit" disabled={certBusy}>
                                                    {certBusy ? (
                                                        <>
                                                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                            提交中…
                                                        </>
                                                    ) : (
                                                        '提交认证'
                                                    )}
                                                </Button>
                                                <span className="text-[11px] text-ink-faint">
                                                    认证资料仅管理员可见
                                                </span>
                                            </div>
                                        </form>
                                    ) : null}
                                </section>
                            ) : null}
                            </>
                        ) : null}

                        {section === 'security' ? (
                            <div className="user-center-security">
                                <form
                                    className="user-center-form-card"
                                    noValidate
                                    onSubmit={(event) => void saveMail(event)}
                                >
                                    <div>
                                        <h4 className="flex items-center gap-2 text-[14px] font-medium">
                                            <Mail className="size-4 text-ink-mute" strokeWidth={1.8} aria-hidden="true" />
                                            登录邮箱
                                        </h4>
                                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                            {api.emailVerify
                                                ? '更换邮箱前需要先向新邮箱发送验证码。'
                                                : '邮箱用于登录和接收站点通知。'}
                                        </p>
                                    </div>
                                    <div className="user-center-current-value">
                                        <span>当前邮箱</span>
                                        <strong>{profile.mail || '未设置'}</strong>
                                    </div>
                                    <label className="user-center-field">
                                        <span className="text-[12px] font-medium text-ink-soft">新邮箱</span>
                                        <Input
                                            id="account-mail"
                                            name="mail"
                                            className="h-10"
                                            type="email"
                                            value={mail}
                                            onChange={(event) => {
                                                setMail(event.target.value);
                                                clearFieldError('account-mail');
                                            }}
                                            autoComplete="email"
                                            maxLength={64}
                                            inputMode="email"
                                            spellCheck={false}
                                            required
                                            disabled={!api.emailChangeEnabled}
                                            data-account-field="account-mail"
                                            aria-invalid={Boolean(fieldErrors['account-mail'])}
                                            aria-describedby={
                                                fieldErrors['account-mail']
                                                    ? 'account-mail-error'
                                                    : undefined
                                            }
                                        />
                                        {fieldErrors['account-mail'] ? (
                                            <small
                                                id="account-mail-error"
                                                className="user-center-field-error"
                                            >
                                                {fieldErrors['account-mail']}
                                            </small>
                                        ) : null}
                                    </label>
                                    {api.emailVerify ? (
                                        <div className="grid gap-1.5">
                                            <span className="text-[12px] font-medium text-ink-soft">邮箱验证码</span>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="account-email-code"
                                                    name="emailCode"
                                                    className="h-10 min-w-0 flex-1"
                                                    value={emailCode}
                                                    onChange={(event) => {
                                                        setEmailCode(event.target.value);
                                                        clearFieldError('email-code');
                                                    }}
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    maxLength={6}
                                                    autoComplete="one-time-code"
                                                    disabled={!api.emailChangeEnabled}
                                                    data-account-field="email-code"
                                                    aria-invalid={Boolean(fieldErrors['email-code'])}
                                                    aria-describedby={
                                                        fieldErrors['email-code']
                                                            ? 'account-email-code-error'
                                                            : undefined
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-10 shrink-0 px-3 text-[12px]"
                                                    disabled={
                                                        sendingCode ||
                                                        cooldown > 0 ||
                                                        mail.trim() === '' ||
                                                        !api.emailChangeEnabled
                                                    }
                                                    onClick={() => void sendEmailCode()}
                                                >
                                                    {cooldown > 0
                                                        ? `${cooldown}s 后重发`
                                                        : sendingCode
                                                          ? '发送中…'
                                                          : '发送验证码'}
                                                </Button>
                                            </div>
                                            {fieldErrors['email-code'] ? (
                                                <small
                                                    id="account-email-code-error"
                                                    className="user-center-field-error"
                                                >
                                                    {fieldErrors['email-code']}
                                                </small>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {!api.emailChangeEnabled ? (
                                        <p className="rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive">
                                            邮件服务尚未配置，暂时无法更换登录邮箱。
                                        </p>
                                    ) : null}
                                    <div>
                                        <Button type="submit" disabled={mailBusy || !api.emailChangeEnabled}>
                                            {mailBusy ? (
                                                <>
                                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                    保存中…
                                                </>
                                            ) : (
                                                '更新邮箱'
                                            )}
                                        </Button>
                                    </div>
                                </form>

                                <div>
                                    <form
                                        className="user-center-form-card"
                                        noValidate
                                        onSubmit={(event) => void savePassword(event)}
                                    >
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[14px] font-medium">
                                                <KeyRound className="size-4 text-ink-mute" strokeWidth={1.8} aria-hidden="true" />
                                                修改密码
                                            </h4>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                修改后当前设备会自动续期，其他设备上的旧登录凭证会失效。
                                            </p>
                                        </div>
                                        <label className="user-center-field">
                                            <span className="text-[12px] font-medium text-ink-soft">当前密码</span>
                                            <Input
                                                id="account-current-password"
                                                name="currentPassword"
                                                className="h-10"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(event) => {
                                                    setCurrentPassword(event.target.value);
                                                    clearFieldError('current-password');
                                                }}
                                                autoComplete="current-password"
                                                maxLength={200}
                                                required
                                                data-account-field="current-password"
                                                aria-invalid={Boolean(fieldErrors['current-password'])}
                                                aria-describedby={
                                                    fieldErrors['current-password']
                                                        ? 'account-current-password-error'
                                                        : undefined
                                                }
                                            />
                                            {fieldErrors['current-password'] ? (
                                                <small
                                                    id="account-current-password-error"
                                                    className="user-center-field-error"
                                                >
                                                    {fieldErrors['current-password']}
                                                </small>
                                            ) : null}
                                        </label>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">新密码</span>
                                                <Input
                                                    id="account-new-password"
                                                    name="newPassword"
                                                    className="h-10"
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(event) => {
                                                        setNewPassword(event.target.value);
                                                        clearFieldError('new-password');
                                                    }}
                                                    autoComplete="new-password"
                                                    minLength={6}
                                                    maxLength={18}
                                                    required
                                                    data-account-field="new-password"
                                                    aria-invalid={Boolean(fieldErrors['new-password'])}
                                                    aria-describedby={
                                                        fieldErrors['new-password']
                                                            ? 'account-new-password-error'
                                                            : undefined
                                                    }
                                                />
                                                {fieldErrors['new-password'] ? (
                                                    <small
                                                        id="account-new-password-error"
                                                        className="user-center-field-error"
                                                    >
                                                        {fieldErrors['new-password']}
                                                    </small>
                                                ) : null}
                                            </label>
                                            <label className="user-center-field">
                                                <span className="text-[12px] font-medium text-ink-soft">确认新密码</span>
                                                <Input
                                                    id="account-confirm-password"
                                                    name="confirmPassword"
                                                    className="h-10"
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(event) => {
                                                        setConfirmPassword(event.target.value);
                                                        clearFieldError('confirm-password');
                                                    }}
                                                    autoComplete="new-password"
                                                    minLength={6}
                                                    maxLength={18}
                                                    required
                                                    data-account-field="confirm-password"
                                                    aria-invalid={Boolean(fieldErrors['confirm-password'])}
                                                    aria-describedby={
                                                        fieldErrors['confirm-password']
                                                            ? 'account-confirm-password-error'
                                                            : undefined
                                                    }
                                                />
                                                {fieldErrors['confirm-password'] ? (
                                                    <small
                                                        id="account-confirm-password-error"
                                                        className="user-center-field-error"
                                                    >
                                                        {fieldErrors['confirm-password']}
                                                    </small>
                                                ) : null}
                                            </label>
                                        </div>
                                        <div>
                                            <Button type="submit" disabled={passwordBusy}>
                                                {passwordBusy ? (
                                                    <>
                                                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                        修改中…
                                                    </>
                                                ) : (
                                                    '修改密码'
                                                )}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        ) : null}

                        {section === 'social' ? (
                            api.oauth?.enabled ? (
                                <div className="user-center-social">
                                    <div className="user-center-form-intro">
                                        <h3>已连接平台</h3>
                                        <p>解绑前请确认站内密码仍可正常使用，避免失去登录方式。</p>
                                    </div>
                                    {oauthProviders.map((provider) => (
                                        <div
                                            key={provider.id}
                                            className="user-center-provider"
                                        >
                                            <UserAvatar
                                                name={provider.name || provider.label}
                                                avatar={provider.avatar}
                                                className="size-11"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-medium">
                                                    {provider.label}
                                                    <span
                                                        className={
                                                            'ml-2 text-[11px] font-normal ' +
                                                            (provider.bound
                                                                ? 'text-brand'
                                                                : 'text-ink-faint')
                                                        }
                                                    >
                                                        {provider.bound ? '已绑定' : '未绑定'}
                                                    </span>
                                                </p>
                                                <p className="mt-0.5 truncate text-[12px] text-ink-mute">
                                                    {provider.bound
                                                        ? provider.name || '已授权'
                                                        : `绑定后可使用 ${provider.label} 登录`}
                                                </p>
                                            </div>
                                            {provider.bound ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="shrink-0"
                                                    disabled={oauthBusy !== ''}
                                                    onClick={() => void unbindOAuth(provider)}
                                                >
                                                    {oauthBusy === provider.id ? (
                                                        <LoaderCircle
                                                            className="animate-spin"
                                                            aria-hidden="true"
                                                        />
                                                    ) : (
                                                        <Unlink aria-hidden="true" />
                                                    )}
                                                    {oauthBusy === provider.id ? '解绑中…' : '解绑'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="shrink-0"
                                                >
                                                    <a
                                                        href={`${api.oauth?.startBase}/${provider.id}/start`}
                                                    >
                                                        <ExternalLink aria-hidden="true" />
                                                        去绑定
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                    ))}

                                    {oauthProviders.length === 0 ? (
                                        <div className="user-center-empty">
                                            {api.oauth?.nullImage ? (
                                                <img
                                                    className="mx-auto h-auto w-48 max-w-full opacity-80"
                                                    src={api.oauth.nullImage}
                                                    alt=""
                                                    width={200}
                                                    height={120}
                                                    loading="lazy"
                                                />
                                            ) : null}
                                            <p className="mt-3 text-[13px] font-medium">
                                                暂未配置社交平台
                                            </p>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                管理员完成任一 OAuth 平台的 App ID 与密钥配置后，这里会出现对应的绑定入口。
                                            </p>
                                        </div>
                                    ) : socialCount === 0 ? (
                                        <div className="user-center-empty">
                                            {api.oauth?.nullImage ? (
                                                <img
                                                    className="mx-auto h-auto w-48 max-w-full opacity-80"
                                                    src={api.oauth.nullImage}
                                                    alt=""
                                                    width={200}
                                                    height={120}
                                                    loading="lazy"
                                                />
                                            ) : null}
                                            <p className="mt-3 text-[13px] font-medium">
                                                尚未绑定社交账号
                                            </p>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                绑定后可使用对应平台一键登录，无需输入本站密码。
                                            </p>
                                        </div>
                                    ) : null}

                                    <p className="user-center-footnote">
                                        绑定不会修改站内密码；你仍可随时解绑已连接平台。
                                    </p>
                                </div>
                            ) : (
                                <div className="user-center-empty">
                                    <p className="text-[13px] font-medium">
                                        站点尚未开放社交账号登录
                                    </p>
                                    <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                        管理员启用 OAuth 登录后，这里会显示可绑定的社交平台。
                                    </p>
                                </div>
                            )
                        ) : null}

                        {section === 'content' ? (
                            <div className="user-center-content-workbench">
                                <ContentManager api={api} profile={profile} />
                            </div>
                        ) : null}

                        {section === 'downloads' ? (
                            <DownloadHistory client={api.downloads} />
                        ) : null}
            </div>
        </UserCenterShell>

            <Dialog open={certDetailsOpen} onOpenChange={setCertDetailsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <BadgeCheck className="size-5 text-status-info" aria-hidden="true" />
                            认证详情
                        </DialogTitle>
                        <DialogDescription>
                            该认证由站点管理员审核，认证信息会展示在个人资料与用户空间。
                        </DialogDescription>
                    </DialogHeader>
                    {certification ? (
                        <div className="grid gap-3 text-[13px]">
                            <div className="rounded-[6px] border border-line bg-surface-2 px-3.5 py-3">
                                <p className="text-[11px] text-ink-faint">认证名称</p>
                                <p className="mt-1 font-medium text-ink">
                                    {certification.name || '已认证用户'}
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-[6px] border border-line px-3.5 py-3">
                                    <p className="text-[11px] text-ink-faint">认证类型</p>
                                    <p className="mt-1 text-ink-soft">
                                        {certification.type === 'organization'
                                            ? '组织认证'
                                            : '个人认证'}
                                    </p>
                                </div>
                                <div className="rounded-[6px] border border-line px-3.5 py-3">
                                    <p className="text-[11px] text-ink-faint">审核时间</p>
                                    <p className="mt-1 text-ink-soft">
                                        {certification.reviewed > 0
                                            ? new Date(
                                                  certification.reviewed * 1000
                                              ).toLocaleString()
                                            : '暂无记录'}
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-[6px] border border-line px-3.5 py-3">
                                <p className="text-[11px] text-ink-faint">认证说明</p>
                                <p className="mt-1 whitespace-pre-wrap break-words leading-6 text-ink-soft">
                                    {certification.note || '未填写认证说明。'}
                                </p>
                            </div>
                            {certification.reason ? (
                                <div className="rounded-[6px] border border-line px-3.5 py-3">
                                    <p className="text-[11px] text-ink-faint">审核备注</p>
                                    <p className="mt-1 break-words leading-6 text-ink-soft">
                                        {certification.reason}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <p className="rounded-[6px] border border-dashed border-line bg-surface-2 px-3.5 py-6 text-center text-[12px] text-ink-faint">
                            暂无认证信息。
                        </p>
                    )}
                </DialogContent>
            </Dialog>

            <CaptchaDialog
                open={checkinCaptchaOpen}
                onOpenChange={setCheckinCaptchaOpen}
                config={api.captcha}
                scene="checkin"
                title="完成验证后签到"
                description="按提示完成人机验证，验证通过后会自动签到并领取奖励。"
                onVerified={(value) => {
                    setCheckinCaptcha(value);
                    void runCheckin(value);
                }}
            />

            <MediaLibrary
                open={avatarMediaOpen}
                onOpenChange={setAvatarMediaOpen}
                mediaEndpoint={api.avatarMedia}
                uploadPurpose="avatar"
                allowDelete={false}
                title="选择头像"
                description="从媒体库选择或上传头像图片"
                onSelect={(item) => {
                    setDetails((current) => ({ ...current, avatar: item.url }));
                    setAvatarMediaOpen(false);
                }}
            />
            <MediaLibrary
                open={backgroundMediaOpen}
                onOpenChange={setBackgroundMediaOpen}
                mediaEndpoint={api.avatarMedia}
                uploadPurpose="background"
                allowDelete={false}
                title="选择个人主页背景"
                description="从媒体库选择或上传背景图片"
                onSelect={(item) => {
                    const nextDetails = { ...details, background: item.url };
                    setDetails(nextDetails);
                    setBackgroundMediaOpen(false);
                    void saveBackground(nextDetails);
                }}
            />
        </>
    );
}

