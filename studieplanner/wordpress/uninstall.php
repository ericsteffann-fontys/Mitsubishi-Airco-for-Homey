<?php
/**
 * Opruimen bij verwijderen van de plugin: alleen het aanbod (catalogus) en de back-ups.
 * Er zijn geen studentgegevens om op te ruimen: die slaat de plugin nooit op.
 */
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
delete_option( 'fontys_studieplanner_catalogus' );
delete_option( 'fontys_studieplanner_backups' );
