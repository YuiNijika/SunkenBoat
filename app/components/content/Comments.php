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
        $isReply = (int) $comments->levels > 0;
        $authorId = (int) $comments->authorId;
        $ownerId = (int) $comments->ownerId;
        ?>
        <li
            id="<?php $comments->theId(); ?>"
            class="comment-item<?php echo $isReply ? ' comment-item-reply' : ''; ?>"
            itemscope
            itemtype="http://schema.org/UserComments"
        >
            <div class="comment-inner">
                <div class="comment-avatar">
                    <?php $comments->gravatar(45, $options->defaultAvatar, $options->avatarHighRes); ?>
                </div>

                <div class="comment-main">
                    <header class="comment-head">
                        <cite class="comment-author" itemprop="creator"><?php $comments->author(); ?></cite>
                        <?php if ($authorId > 0): ?>
                            <span class="comment-role">
                                <?php echo $authorId === $ownerId ? '博主' : '用户'; ?>
                            </span>
                        <?php endif; ?>

                        <?php if ((string) $comments->status !== 'approved'): ?>
                            <span class="comment-status">待审核</span>
                        <?php endif; ?>

                        <a class="comment-time" href="<?php $comments->permalink(); ?>">
                            <time datetime="<?php $comments->date('c'); ?>" itemprop="commentTime"><?php $comments->date('Y-m-d H:i'); ?></time>
                        </a>
                    </header>

                    <div class="comment-content-row">
                        <div class="comment-content" itemprop="commentText"><?php
                            $commentText = $comments->parentContent->hidden
                                ? _t('内容被隐藏')
                                : (string) $comments->text;
                            echo \SunkenBoat\Support\CommentMarkup::html($commentText);
                        ?></div>
                        <div class="comment-reply"><?php $comments->reply((string) $options->replyWord); ?></div>
                    </div>

                    <?php if ($comments->children): ?>
                        <div class="comment-children<?php echo $isReply ? ' comment-children-flat' : ''; ?>">
                            <?php $comments->threadedComments(); ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
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
    'profileUrl' => $capture(static fn () => $options->profileUrl()),
    'logoutUrl' => $capture(static fn () => $options->logoutUrl()),
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
