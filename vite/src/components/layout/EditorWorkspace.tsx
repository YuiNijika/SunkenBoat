import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import ContentEditor from './ContentEditor';
import { loadSession } from '../../lib/session';
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
        let active = true;

        void loadSession(api).then((result) => {
            if (!active) {
                return;
            }

            if (result.status === 'guest') {
                setStatus('guest');
                return;
            }

            if (result.status === 'error') {
                setError(result.message || '读取登录状态失败');
                setStatus('error');
                return;
            }

            setProfile(result.profile);
            setStatus('ready');
        });

        return () => {
            active = false;
        };
    }, [api.authenticated, api.me, api.session]);

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

    if (!api.content.permitted) {
        return (
            <div className="editor-gate">
                <p className="editor-gate-title">当前账号没有发布权限</p>
                <p className="editor-gate-text">站点限制了前台文章发布权限，请联系管理员调整用户组或主题设置。</p>
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
