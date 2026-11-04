<?php
// Kerstmarkt bestelstatus – PHP-backend voor gewone (FTP-)webhosting.
// Vereist PHP 7.4+. Data wordt opgeslagen in data/orders.php (niet via de browser leesbaar).

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$CONFIG = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
$SETTINGS = require __DIR__ . '/instellingen.php';
$DATA_DIR = __DIR__ . '/data';
$DATA_FILE = $DATA_DIR . '/orders.php';
$HITS_FILE = $DATA_DIR . '/hits.php';
const GUARD = "<?php exit; ?>\n";
$STATUSES = ['betalen', 'wachtrij', 'printen', 'klaar', 'opgehaald', 'geannuleerd'];

function out(int $status, array $body): void {
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}
function now_ms(): int { return (int) round(microtime(true) * 1000); }
function body(): array {
  $raw = file_get_contents('php://input', false, null, 0, 10000);
  $d = json_decode($raw ?: '{}', true);
  return is_array($d) ? $d : [];
}

// ---------- opslag met bestandslock ----------
if (!is_dir($DATA_DIR)) @mkdir($DATA_DIR, 0755, true);
$fh = fopen($DATA_FILE, 'c+');
if (!$fh) out(500, ['error' => 'Kan data/ niet schrijven. Controleer de schrijfrechten (755/775).']);
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$orders = [];
if ($raw && strpos($raw, GUARD) === 0) $orders = json_decode(substr($raw, strlen(GUARD)), true) ?: [];
$dirty = false;

function save(): void {
  global $fh, $orders;
  ftruncate($fh, 0);
  rewind($fh);
  fwrite($fh, GUARD . json_encode($orders, JSON_UNESCAPED_UNICODE));
  fflush($fh);
}
register_shutdown_function(function () {
  global $fh, $dirty;
  if ($dirty) save();
  flock($fh, LOCK_UN);
  fclose($fh);
});

// ---------- opruimen (bij elk verzoek) ----------
$MIN = 60000;
$c = $CONFIG['cleanup'];
$purgeAt = !empty($c['purgeEverythingAfter']) ? strtotime($c['purgeEverythingAfter']) * 1000 : PHP_INT_MAX;
$t = now_ms();
foreach ($orders as $code => $o) {
  $age = $t - $o['updatedAt'];
  if ($t > $purgeAt
    || ($o['status'] === 'opgehaald' && $age > $c['pickedUpVisibleMinutes'] * $MIN)
    || ($o['status'] === 'geannuleerd' && $age > $c['cancelledVisibleMinutes'] * $MIN)
    || ($o['status'] === 'betalen' && $age > $c['unpaidExpireMinutes'] * $MIN)) {
    unset($orders[$code]);
    $dirty = true;
  }
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
function clean_name($name): string {
  global $CONFIG;
  $n = preg_replace('/[\x00-\x1f<>]/u', '', (string) $name);
  $n = trim(preg_replace('/\s+/u', ' ', $n));
  return mb_substr($n, 0, (int) $CONFIG['maxNameLength']);
}
function valid_color($id): bool {
  global $CONFIG;
  foreach ($CONFIG['colors'] as $col) if ($col['id'] === $id) return true;
  return false;
}
function public_order(array $o): array {
  // Bewust géén wachtrijpositie of totalen.
  return ['code' => $o['code'], 'name' => $o['name'], 'color' => $o['color'], 'status' => $o['status'],
          'createdAt' => $o['createdAt'], 'updatedAt' => $o['updatedAt']];
}
function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? 'onbekend'; }
function limited(string $key, int $max, int $windowSec): bool {
  global $HITS_FILE;
  $h = fopen($HITS_FILE, 'c+');
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

if ($a === 'config') {
  $pub = [];
  foreach (['shopName', 'tagline', 'price', 'maxNameLength', 'selfOrder', 'colors', 'days', 'standLocation'] as $k) $pub[$k] = $CONFIG[$k];
  out(200, $pub);
}

if ($a === 'order' && $method === 'GET') {
  if (limited('look:' . client_ip(), 240, 60)) out(429, ['error' => 'Te veel verzoeken.']);
  $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['code'] ?? ''));
  if (!isset($orders[$code])) out(404, ['error' => 'Niet (meer) gevonden.']);
  out(200, public_order($orders[$code]));
}

if ($a === 'order' && $method === 'POST') {
  if (empty($CONFIG['selfOrder'])) out(403, ['error' => 'Bestellen gaat via de kraam.']);
  if (limited('order:' . client_ip(), 6, 600)) out(429, ['error' => 'Even rustig aan, probeer het zo nog eens.']);
  $b = body();
  $name = clean_name($b['name'] ?? '');
  if ($name === '') out(400, ['error' => 'Vul een naam in.']);
  if (!valid_color($b['color'] ?? '')) out(400, ['error' => 'Kies een kleur.']);
  $o = ['code' => new_code(), 'name' => $name, 'color' => $b['color'], 'status' => 'betalen',
        'createdAt' => now_ms(), 'updatedAt' => now_ms(), 'source' => 'klant'];
  $orders[$o['code']] = $o; $dirty = true;
  out(201, public_order($o));
}

if ($a === 'login' && $method === 'POST') {
  if (limited('pin:' . client_ip(), 8, 600)) out(429, ['error' => 'Te vaak geprobeerd, wacht even.']);
  $pin = (string) ($SETTINGS['admin_pin'] ?? '');
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
    out(200, ['orders' => $list, 'statuses' => $STATUSES]);
  }
  if ($a === 'admin_create' && $method === 'POST') {
    $b = body();
    $name = clean_name($b['name'] ?? '');
    if ($name === '') out(400, ['error' => 'Vul een naam in.']);
    if (!valid_color($b['color'] ?? '')) out(400, ['error' => 'Kies een kleur.']);
    $o = ['code' => new_code(), 'name' => $name, 'color' => $b['color'], 'status' => 'wachtrij',
          'createdAt' => now_ms(), 'updatedAt' => now_ms(), 'source' => 'kraam'];
    $orders[$o['code']] = $o; $dirty = true;
    out(201, $o);
  }
  if ($a === 'admin_update' && $method === 'POST') {
    $code = strtoupper($_GET['code'] ?? '');
    if (!isset($orders[$code])) out(404, ['error' => 'Niet gevonden.']);
    $b = body();
    if (isset($b['status'])) {
      if (!in_array($b['status'], $STATUSES, true)) out(400, ['error' => 'Onbekende status.']);
      $orders[$code]['status'] = $b['status'];
    }
    if (isset($b['name']) && clean_name($b['name']) !== '') $orders[$code]['name'] = clean_name($b['name']);
    if (isset($b['color']) && valid_color($b['color'])) $orders[$code]['color'] = $b['color'];
    $orders[$code]['updatedAt'] = now_ms();
    $dirty = true;
    out(200, $orders[$code]);
  }
  if ($a === 'admin_logout') {
    session_start(); $_SESSION = []; session_destroy();
    out(200, ['ok' => true]);
  }
}

out(404, ['error' => 'Niet gevonden.']);
