<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

$archive = $viewData['archive'] ?? null;
if (!$archive instanceof \Widget\Archive) {
    return;
}

$capture = static function (callable $callback): string {
    $level = ob_get_level();
    ob_start();

    try {
        $callback();
        return trim((string) ob_get_clean());
    } catch (\Throwable) {
        while (ob_get_level() > $level) {
            ob_end_clean();
        }

        return '';
    }
};

$user = \Widget\User::alloc();
$options = \Widget\Options::alloc();

if (!function_exists('threadedComments')) {
    /**
     * Typecho checks for this callback before printing its own comment HTML.
     */
    function threadedComments(\Widget\Comments\Archive $comments, \Typecho\Config $options): void
    {
        $formatCommentTime = static function (int $timestamp): string {
            $now = time();
            $diff = max(0, $now - $timestamp);
            $date = date('Y-m-d', $timestamp);

            if ($diff < 60) {
                return '刚刚';
            }
            if ($diff < 3600) {
                return (string) floor($diff / 60) . ' 分钟前';
            }
            if ($date === date('Y-m-d', $now)) {
                return (string) floor($diff / 3600) . ' 小时前';
            }
            if ($date === date('Y-m-d', strtotime('-1 day', $now))) {
                return '昨天';
            }
            if (date('Y', $timestamp) === date('Y', $now)) {
                return date('m-d', $timestamp);
            }

            return date('Y-m-d', $timestamp);
        };
        $isReply = (int) $comments->levels > 0;
        $authorId = (int) $comments->authorId;
        $ownerId = (int) $comments->ownerId;
        $customAvatar = $authorId > 0
            ? \SunkenBoat\Support\UserProfile::customAvatar($authorId)
            : '';
        $canReply = (bool) $options->commentsThreaded && !$comments->isTopLevel;
        ?>
        <li
            id="<?php $comments->theId(); ?>"
            class="<?php echo $isReply ? 'comment-reply-item' : 'comment-item'; ?>"
            itemscope
            itemtype="http://schema.org/UserComments"
        >
            <?php if ($isReply): ?>
                <div class="comment-reply-body">
                    <div class="comment-reply-copy">
                        <span class="comment-reply-head">
                            <cite class="comment-author" itemprop="creator"><?php $comments->author(); ?></cite>
                            <?php if ($authorId > 0): ?>
                                <span class="comment-badge<?php echo $authorId === $ownerId ? ' comment-badge-owner' : ''; ?>">
                                    <?php echo $authorId === $ownerId ? '博主' : '用户'; ?>
                                </span>
                            <?php endif; ?>
                            <?php if ((string) $comments->status !== 'approved'): ?>
                                <span class="comment-status">待审核</span>
                            <?php endif; ?>
                            <span class="comment-reply-colon">：</span>
                            <a class="comment-reply-time" href="<?php $comments->permalink(); ?>">
                                <time datetime="<?php $comments->date('c'); ?>" itemprop="commentTime"><?php echo \TTDF\Support\Escaper::html($formatCommentTime((int) $comments->created)); ?></time>
                            </a>
                        </span>
                        <div class="comment-reply-content" itemprop="commentText"><?php
                            $commentText = $comments->parentContent->hidden
                                ? _t('内容被隐藏')
                                : (string) $comments->text;
                            echo \SunkenBoat\Support\CommentMarkup::html($commentText);
                        ?></div>
                    </div>
                    <?php if ($canReply): ?>
                        <div class="comment-actions">
                            <span class="comment-action"><?php $comments->reply((string) $options->replyWord); ?></span>
                        </div>
                    <?php endif; ?>
                </div>
            <?php else: ?>
                <div class="comment-item-shell">
                    <div class="comment-avatar">
                        <?php if ($customAvatar !== ''): ?>
                            <img
                                class="avatar comment-avatar-img"
                                src="<?php echo \TTDF\Support\Escaper::url($customAvatar); ?>"
                                alt=""
                                width="40"
                                height="40"
                                loading="lazy"
                                decoding="async"
                                referrerpolicy="no-referrer"
                            >
                        <?php else: ?>
                            <?php $comments->gravatar(40, $options->defaultAvatar, $options->avatarHighRes); ?>
                        <?php endif; ?>
                    </div>

                    <div class="comment-item-main">
                        <div class="comment-item-head">
                            <div class="comment-item-author-row">
                                <cite class="comment-author" itemprop="creator"><?php $comments->author(); ?></cite>
                                <?php if ($authorId > 0): ?>
                                    <span class="comment-badge<?php echo $authorId === $ownerId ? ' comment-badge-owner' : ''; ?>">
                                        <?php echo $authorId === $ownerId ? '博主' : '用户'; ?>
                                    </span>
                                <?php endif; ?>
                                <?php if ((string) $comments->status !== 'approved'): ?>
                                    <span class="comment-status">待审核</span>
                                <?php endif; ?>
                            </div>
                            <a class="comment-item-time" href="<?php $comments->permalink(); ?>">
                                <time datetime="<?php $comments->date('c'); ?>" itemprop="commentTime"><?php echo \TTDF\Support\Escaper::html($formatCommentTime((int) $comments->created)); ?></time>
                            </a>
                        </div>

                        <div class="comment-content" itemprop="commentText"><?php
                            $commentText = $comments->parentContent->hidden
                                ? _t('内容被隐藏')
                                : (string) $comments->text;
                            echo \SunkenBoat\Support\CommentMarkup::html($commentText);
                        ?></div>

                        <?php if ($canReply): ?>
                            <div class="comment-actions">
                                <span class="comment-action"><?php $comments->reply((string) $options->replyWord); ?></span>
                            </div>
                        <?php endif; ?>

                        <?php if ($comments->children): ?>
                            <?php $comments->threadedComments(); ?>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endif; ?>

            <?php if ($isReply && $comments->children): ?>
                <?php $comments->threadedComments(); ?>
            <?php endif; ?>
        </li>
        <?php
    }
}

$archive->comments()->to($comments);

$countText = $capture(static fn () => $archive->commentsNum(
    '还没有评论',
    '1 条评论',
    '%d 条评论'
));

$listHtml = $comments->have()
    ? $capture(static fn () => $comments->listComments([
        'before' => '<ol class="comment-list">',
        'after' => '</ol>',
        'replyWord' => '回复',
        'avatarSize' => 45,
    ]))
    : '';

$paginationHtml = $capture(static fn () => $comments->pageNav('上一页', '下一页'));
$cancelReplyHtml = $capture(static fn () => $comments->cancelReply());
$respondId = (string) $archive->respondId;
$commentUrl = (string) $archive->commentUrl;
$viewerAvatar = $user->hasLogin()
    ? \SunkenBoat\Support\Avatar::forUser(
        (int) $user->uid,
        (string) $user->mail,
        90
    )
    : '';

$payload = [
    'allow' => (bool) $archive->allow('comment'),
    'nullImage' => \TTDF\Theme\Assets::url('img/null.svg'),
    'countText' => $countText,
    'listHtml' => $listHtml,
    'paginationHtml' => $paginationHtml,
    'cancelReplyHtml' => $cancelReplyHtml,
    'respondId' => $respondId,
    'action' => $commentUrl,
    'loggedIn' => (bool) $user->hasLogin(),
    'screenName' => $capture(static fn () => $user->screenName()),
    'viewerAvatar' => $viewerAvatar,
    'profileUrl' => $capture(static fn () => $options->profileUrl()),
    'logoutUrl' => $capture(static fn () => $options->logoutUrl()),
    'loginUrl' => (string) $options->loginUrl,
    'registerUrl' => (string) $options->registerUrl,
    'registerEnabled' => (bool) $options->allowRegister,
    'remember' => [
        'author' => (string) $archive->remember('author', true),
        'mail' => (string) $archive->remember('mail', true),
        'url' => (string) $archive->remember('url', true),
    ],
    'requireMail' => (bool) $options->commentsRequireMail,
    'requireUrl' => (bool) $options->commentsRequireUrl,
];

echo json_encode(
    $payload,
    JSON_HEX_TAG
    | JSON_HEX_AMP
    | JSON_HEX_APOS
    | JSON_HEX_QUOT
    | JSON_UNESCAPED_UNICODE
    | JSON_UNESCAPED_SLASHES
    | JSON_INVALID_UTF8_SUBSTITUTE
    | JSON_THROW_ON_ERROR
);
