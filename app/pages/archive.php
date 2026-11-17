<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use TTDF\Framework;
use TTDF\Theme\Templates;
use TTDF\View\Components;

$root = Framework::root();

Components::render($root, 'layout/AppHeader', ['archive' => $this]);

$slot = Templates::archiveSlot($this);
$rendered = Templates::render($root, $slot, $this, 'content/Archive');
if (!$rendered && $slot !== 'archive') {
    $rendered = Templates::render($root, 'archive', $this, 'content/Archive');
}

if (!$rendered) {
    PageData::emit(PageData::archive($this));
}

Components::render($root, 'layout/AppFooter', ['archive' => $this]);
