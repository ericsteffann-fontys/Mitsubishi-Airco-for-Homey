<?php
// Kerstmarkt bestelstatus – PHP-backend voor gewone (FTP-)webhosting.
// Vereist PHP 7.4+. Data staat in data/*.php (niet via de browser leesbaar).

declare(strict_types=1);
date_default_timezone_set('Europe/Amsterdam');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$CONFIG = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
$ALL_COLORS = json_decode(file_get_contents(__DIR__ . '/kleuren.json'), true)['kleuren'];
$SECRETS = require __DIR__ . '/instellingen.php';
$DATA_DIR = __DIR__ . '/data';
const GUARD = "<?php exit; ?>\n";
$STATUSES = ['betalen', 'wachtrij', 'printen', 'klaar', 'opgehaald', 'geannuleerd'];

function out(int $status, array $body): void {
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}
function now_ms(): int { return (int) round(microtime(true) * 1000); }
function body(): array {
  $raw = file_get_contents('php://input', false, null, 0, 20000);
  $d = json_decode($raw ?: '{}', true);
  return is_array($d) ? $d : [];
}
function read_guarded(string $file): array {
  if (!is_file($file)) return [];
  $raw = (string) file_get_contents($file);
  return strpos($raw, GUARD) === 0 ? (json_decode(substr($raw, strlen(GUARD)), true) ?: []) : [];
}

if (!is_dir($DATA_DIR)) @mkdir($DATA_DIR, 0755, true);

// ---------- instellingen (aanpasbaar via kraam.html) ----------
$SETTINGS_FILE = $DATA_DIR . '/settings.php';
$SETTINGS = array_merge($CONFIG['defaults'], read_guarded($SETTINGS_FILE));

function color_map(): array {
  global $ALL_COLORS;
  $m = [];
  foreach ($ALL_COLORS as $c) $m[$c['id']] = $c;
  return $m;
}
function enabled_colors(): array {
  global $ALL_COLORS, $SETTINGS;
  return array_values(array_filter($ALL_COLORS, fn($c) => in_array($c['id'], $SETTINGS['enabledColors'], true)));
}

// ---------- bestellingen met bestandslock ----------
$fh = fopen($DATA_DIR . '/orders.php', 'c+');
if (!$fh) out(500, ['error' => 'Kan data/ niet schrijven. Controleer de schrijfrechten (755/775).']);
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$orders = ($raw && strpos($raw, GUARD) === 0) ? (json_decode(substr($raw, strlen(GUARD)), true) ?: []) : [];
$dirty = false;

register_shutdown_function(function () {
  global $fh, $dirty, $orders;
  if ($dirty) {
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, GUARD . json_encode($orders, JSON_UNESCAPED_UNICODE));
    fflush($fh);
  }
  flock($fh, LOCK_UN);
  fclose($fh);
});

// ---------- opruimen (bij elk verzoek) ----------
$MIN = 60000;
$c = $CONFIG['cleanup'];
$lastDay = end($SETTINGS['days']);
$marketEnd = strtotime($lastDay['date'] . ' ' . $lastDay['close']) * 1000;
$purgeAll = $marketEnd + $c['purgeDaysAfterMarket'] * 86400000;
$purgeDeliveries = $marketEnd + $c['purgeDeliveriesDaysAfterMarket'] * 86400000;
$t = now_ms();
foreach ($orders as $code => $o) {
  $age = $t - $o['updatedAt'];
  $hasDelivery = !empty($o['delivery']);
  $gone =
    ($t > ($hasDelivery && $o['status'] !== 'opgehaald' ? $purgeDeliveries : $purgeAll))
    || ($o['status'] === 'opgehaald' && $age > $c['pickedUpVisibleMinutes'] * $MIN)
    || ($o['status'] === 'geannuleerd' && $age > $c['cancelledVisibleMinutes'] * $MIN)
    || ($o['status'] === 'betalen' && $age > $c['unpaidExpireMinutes'] * $MIN);
  if ($gone) { unset($orders[$code]); $dirty = true; }
}

// ---------- helpers ----------
function new_code(): string {
  global $orders;
  $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  do {
    $code = '';
    for ($i = 0; $i < 5; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
  } while (isset($orders[$code]));
  return $code;
}
function clean_text($s, int $max): string {
  $n = preg_replace('/[\x00-\x1f<>]/u', '', (string) $s);
  return mb_substr(trim(preg_replace('/\s+/u', ' ', $n)), 0, $max);
}
function clean_name($name): string {
  global $CONFIG;
  return clean_text($name, (int) $CONFIG['maxNameLength']);
}
function public_order(array $o): array {
  // Bewust géén wachtrijpositie, totalen of adresgegevens.
  return ['code' => $o['code'], 'name' => $o['name'], 'color' => $o['color'], 'status' => $o['status'],
          'delivery' => !empty($o['delivery']), 'createdAt' => $o['createdAt'], 'updatedAt' => $o['updatedAt']];
}
function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? 'onbekend'; }
function limited(string $key, int $max, int $windowSec): bool {
  global $DATA_DIR;
  $h = fopen($DATA_DIR . '/hits.php', 'c+');
  if (!$h) return false;
  flock($h, LOCK_EX);
  $raw = stream_get_contents($h);
  $hits = ($raw && strpos($raw, GUARD) === 0) ? (json_decode(substr($raw, strlen(GUARD)), true) ?: []) : [];
  $now = time();
  foreach ($hits as $k => $list) {
    $hits[$k] = array_values(array_filter($list, fn($x) => $now - $x < 3600));
    if (!$hits[$k]) unset($hits[$k]);
  }
  $list = array_values(array_filter($hits[$key] ?? [], fn($x) => $now - $x < $windowSec));
  $list[] = $now;
  $hits[$key] = $list;
  ftruncate($h, 0); rewind($h);
  fwrite($h, GUARD . json_encode($hits));
  flock($h, LOCK_UN); fclose($h);
  return count($list) > $max;
}
function public_config(): array {
  global $CONFIG, $SETTINGS, $ALL_COLORS;
  return [
    'shopName' => $CONFIG['shopName'], 'tagline' => $CONFIG['tagline'], 'maxNameLength' => $CONFIG['maxNameLength'],
    'selfOrder' => $CONFIG['selfOrder'], 'standLocation' => $CONFIG['standLocation'],
    'deliveryPlace' => $CONFIG['delivery']['placeLabel'], 'deliveryWithin' => $CONFIG['delivery']['withinText'],
    'price' => $SETTINGS['price'], 'days' => $SETTINGS['days'], 'colors' => enabled_colors(), 'allColors' => $ALL_COLORS,
  ];
}

// ---------- beheer-sessie ----------
session_name('kraam');
session_set_cookie_params(['lifetime' => 172800, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict',
                           'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
function is_admin(): bool {
  if (session_status() !== PHP_SESSION_ACTIVE) session_start();
  return !empty($_SESSION['kraam']);
}

// ---------- routes ----------
$a = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($_GET['code'] ?? '')));

if ($a === 'config') out(200, public_config());

if ($a === 'order' && $method === 'GET') {
  if (limited('look:' . client_ip(), 240, 60)) out(429, ['error' => 'Te veel verzoeken.']);
  if (!isset($orders[$code])) out(404, ['error' => 'Niet (meer) gevonden.']);
  out(200, public_order($orders[$code]));
}

if ($a === 'order' && $method === 'POST') {
  if (empty($CONFIG['selfOrder'])) out(403, ['error' => 'Bestellen gaat via de kraam.']);
  if (limited('order:' . client_ip(), 6, 600)) out(429, ['error' => 'Even rustig aan, probeer het zo nog eens.']);
  $b = body();
  $name = clean_name($b['name'] ?? '');
  if ($name === '') out(400, ['error' => 'Vul een naam in.']);
  if (!in_array($b['color'] ?? '', array_column(enabled_colors(), 'id'), true)) out(400, ['error' => 'Kies een kleur.']);
  $o = ['code' => new_code(), 'name' => $name, 'color' => $b['color'], 'status' => 'betalen',
        'createdAt' => now_ms(), 'updatedAt' => now_ms(), 'source' => 'klant'];
  $orders[$o['code']] = $o; $dirty = true;
  out(201, public_order($o));
}

// Klant laat bezorgadres achter (alleen Son en Breugel).
if ($a === 'delivery' && $method === 'POST') {
  if (limited('deliv:' . client_ip(), 10, 600)) out(429, ['error' => 'Even rustig aan, probeer het zo nog eens.']);
  if (!isset($orders[$code])) out(404, ['error' => 'Bestelling niet gevonden.']);
  $o = &$orders[$code];
  if (!in_array($o['status'], ['wachtrij', 'printen', 'klaar'], true)) out(400, ['error' => 'Bezorgen kan alleen voor betaalde bestellingen die nog niet zijn opgehaald.']);
  $b = body();
  $street = clean_text($b['street'] ?? '', 60);
  $number = clean_text($b['number'] ?? '', 12);
  $postcode = strtoupper(preg_replace('/\s+/', '', (string) ($b['postcode'] ?? '')));
  $city = clean_text($b['city'] ?? '', 40);
  if ($street === '' || $number === '' || $postcode === '' || $city === '') out(400, ['error' => 'Vul alle adresvelden in.']);
  if (!preg_match('/^[1-9][0-9]{3}[A-Z]{2}$/', $postcode)) out(400, ['error' => 'Vul een geldige postcode in, bijvoorbeeld 5691 AB.']);
  if (!in_array(mb_strtolower($city), $CONFIG['delivery']['places'], true)
      || !in_array(substr($postcode, 0, 4), $CONFIG['delivery']['postcodes'] ?? [substr($postcode, 0, 4)], true)) {
    out(400, ['error' => 'Thuisbezorgen kan alleen binnen ' . $CONFIG['delivery']['placeLabel'] . '.']);
  }
  $o['delivery'] = ['street' => $street, 'number' => $number,
                    'postcode' => substr($postcode, 0, 4) . ' ' . substr($postcode, 4), 'city' => $city, 'at' => now_ms()];
  $o['updatedAt'] = now_ms();
  $dirty = true;
  out(200, public_order($o));
}

if ($a === 'login' && $method === 'POST') {
  if (limited('pin:' . client_ip(), 8, 600)) out(429, ['error' => 'Te vaak geprobeerd, wacht even.']);
  $pin = (string) ($SECRETS['admin_pin'] ?? '');
  $b = body();
  if ($pin === '' || $pin === 'VERANDER-MIJ' || !hash_equals($pin, (string) ($b['pin'] ?? ''))) {
    out(401, ['error' => $pin === 'VERANDER-MIJ' ? 'Stel eerst een pincode in, in instellingen.php.' : 'Onjuiste pincode.']);
  }
  session_start();
  session_regenerate_id(true);
  $_SESSION['kraam'] = true;
  out(200, ['ok' => true]);
}

if (strpos($a, 'admin_') === 0) {
  if (!is_admin()) out(401, ['error' => 'Niet ingelogd.']);
  session_write_close();

  if ($a === 'admin_list') {
    $list = array_values($orders);
    usort($list, fn($x, $y) => $x['createdAt'] <=> $y['createdAt']);
    out(200, ['orders' => $list, 'statuses' => $STATUSES, 'allColors' => $ALL_COLORS]);
  }
  if ($a === 'admin_create' && $method === 'POST') {
    $b = body();
    $name = clean_name($b['name'] ?? '');
    if ($name === '') out(400, ['error' => 'Vul een naam in.']);
    if (!isset(color_map()[$b['color'] ?? ''])) out(400, ['error' => 'Kies een kleur.']);
    $o = ['code' => new_code(), 'name' => $name, 'color' => $b['color'], 'status' => 'wachtrij',
          'createdAt' => now_ms(), 'updatedAt' => now_ms(), 'source' => 'kraam'];
    $orders[$o['code']] = $o; $dirty = true;
    out(201, $o);
  }
  if ($a === 'admin_update' && $method === 'POST') {
    if (!isset($orders[$code])) out(404, ['error' => 'Niet gevonden.']);
    $b = body();
    if (isset($b['status'])) {
      if (!in_array($b['status'], $STATUSES, true)) out(400, ['error' => 'Onbekende status.']);
      $orders[$code]['status'] = $b['status'];
    }
    if (array_key_exists('delivery', $b) && $b['delivery'] === null) unset($orders[$code]['delivery']);
    $orders[$code]['updatedAt'] = now_ms();
    $dirty = true;
    out(200, $orders[$code]);
  }
  if ($a === 'admin_settings' && $method === 'GET') {
    out(200, ['settings' => $SETTINGS, 'allColors' => $ALL_COLORS]);
  }
  if ($a === 'admin_settings' && $method === 'POST') {
    $b = body();
    $new = $SETTINGS;
    if (isset($b['price'])) {
      $price = clean_text($b['price'], 20);
      if ($price === '') out(400, ['error' => 'Vul een prijs in.']);
      $new['price'] = $price;
    }
    if (isset($b['enabledColors']) && is_array($b['enabledColors'])) {
      $ids = array_values(array_intersect(array_column($ALL_COLORS, 'id'), $b['enabledColors']));
      if (!$ids) out(400, ['error' => 'Zet minstens één kleur aan.']);
      $new['enabledColors'] = $ids;
    }
    if (isset($b['days']) && is_array($b['days'])) {
      $days = [];
      foreach ($b['days'] as $i => $d) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d['date'] ?? '') || !preg_match('/^\d{2}:\d{2}$/', $d['open'] ?? '')
            || !preg_match('/^\d{2}:\d{2}$/', $d['close'] ?? '')) out(400, ['error' => 'Controleer de datums en tijden.']);
        $days[] = ['label' => $SETTINGS['days'][$i]['label'] ?? clean_text($d['label'] ?? '', 20),
                   'date' => $d['date'], 'open' => $d['open'], 'close' => $d['close']];
      }
      if ($days) $new['days'] = $days;
    }
    file_put_contents($SETTINGS_FILE, GUARD . json_encode($new, JSON_UNESCAPED_UNICODE), LOCK_EX);
    out(200, ['settings' => $new]);
  }
  if ($a === 'admin_logout') {
    session_start(); $_SESSION = []; session_destroy();
    out(200, ['ok' => true]);
  }
}

out(404, ['error' => 'Niet gevonden.']);
