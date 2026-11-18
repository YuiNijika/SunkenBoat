import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import ContentEditor from './ContentEditor';
import { errorMessage, profileFrom, readPayload } from '../../lib/user';
import type { ArticleField, UserApiEndpoints, UserProfile } from '../../types';

interface Props {
    api: UserApiEndpoints;
    cid: number;
    fields: ArticleField[];
}

export default function EditorWorkspace({ api, cid, fields }: Props) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'guest' | 'error'>('loading');
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        void (async () => {
            try {
                const session = await fetch(api.session, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                if (session.status === 401) {
                    if (active) {
                        setStatus('guest');
                    }
                    return;
                }

                const sessionPayload = await readPayload(session);
                if (!session.ok) {
                    throw new Error(errorMessage(sessionPayload, '读取登录状态失败'));
                }

                let current = profileFrom(sessionPayload);
                if (!current) {
                    throw new Error('登录状态异常，请重新登录');
                }

                const detail = await fetch(api.me, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                if (detail.ok) {
                    current = profileFrom(await readPayload(detail)) ?? current;
                }

                if (
                    current.canWrite !== true &&
                    (current.group === 'administrator' || current.group === 'editor')
                ) {
                    current = { ...current, canWrite: true };
                }

                if (active) {
                    setProfile(current);
                    setStatus('ready');
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setError(reason instanceof Error ? reason.message : '读取登录状态失败');
                    setStatus('error');
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [api.me, api.session]);

    if (status === 'loading') {
        return (
            <div className="editor-gate" role="status" aria-live="polite">
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                <p>正在准备编辑器…</p>
            </div>
        );
    }

    if (status === 'guest') {
        return (
            <div className="editor-gate">
                <p className="editor-gate-title">请先登录</p>
                <p className="editor-gate-text">登录后即可进入内容编辑器。</p>
                <a className="editor-gate-link" href={api.pages.profile}>
                    前往用户中心
                </a>
            </div>
        );
    }

    if (status === 'error' || !profile) {
        return (
            <div className="editor-gate">
                <p className="editor-gate-title">编辑器暂不可用</p>
                <p className="editor-gate-text">{error || '请稍后重试。'}</p>
                <a className="editor-gate-link" href={api.pages.content}>
                    返回内容管理
                </a>
            </div>
        );
    }

    if (!profile.canWrite) {
        return (
            <div className="editor-gate">
                <p className="editor-gate-title">当前账号没有发布权限</p>
                <p className="editor-gate-text">只有管理员与编辑可以进入内容编辑器。</p>
                <a className="editor-gate-link" href={api.pages.content}>
                    返回内容管理
                </a>
            </div>
        );
    }

    if (!api.content.enabled) {
        return (
            <div className="editor-gate">
                <p className="editor-gate-title">内容发布暂不可用</p>
                <p className="editor-gate-text">站点尚未启用前台内容接口。</p>
                <a className="editor-gate-link" href={api.pages.content}>
                    返回内容管理
                </a>
            </div>
        );
    }

    return <ContentEditor api={api} profile={profile} cid={cid} fields={fields} />;
}
