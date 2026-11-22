<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

$shared = require __DIR__ . '/theme/shared.php';

$blockWidthField = $shared['blockWidthField'];
$blockLayoutFields = $shared['blockLayoutFields'];
$commonBlocks = $shared['commonBlocks'];
$heroBlockOption = $shared['heroBlockOption'];
$carouselBlockOption = $shared['carouselBlockOption'];
$forumTopicListOption = $shared['forumTopicListOption'];
$forumHomeMainOptions = $shared['forumHomeMainOptions'];
$forumCircleMainOptions = $shared['forumCircleMainOptions'];
$forumLeftOptions = $shared['forumLeftOptions'];
$forumRightOptions = $shared['forumRightOptions'];
$economyLevelDefaults = $shared['economyLevelDefaults'];
$economyLevelOptions = $shared['economyLevelOptions'];
$economyLevels = $shared['economyLevels'];

return [
    'General' => require __DIR__ . '/theme/general.php',
    'Layout' => require __DIR__ . '/theme/layout.php',
    'Forum' => require __DIR__ . '/theme/forum.php',
    'Mail' => require __DIR__ . '/theme/mail.php',
    'Access' => require __DIR__ . '/theme/access.php',
    'Download' => require __DIR__ . '/theme/download.php',
    'Payment' => require __DIR__ . '/theme/payment.php',
    'Runtime' => require __DIR__ . '/theme/runtime.php',
];
