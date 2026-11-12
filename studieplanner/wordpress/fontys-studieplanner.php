<?php
/**
 * Plugin Name:       Fontys Studieplanner
 * Description:       Laat studenten (samen met hun studiecoach) een persoonlijk studieprogramma samenstellen uit EvL's. Plaats de planner met de shortcode [studieplanner]. Het aanbod beheer je onder het menu Studieplanner. Er worden geen studentgegevens opgeslagen: het plan wordt een PDF bij de student.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Fontys
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       fontys-studieplanner
 */

defined( 'ABSPATH' ) || exit;

define( 'FONTYS_SP_VERSION', '1.0.0' );
define( 'FONTYS_SP_DIR', plugin_dir_path( __FILE__ ) );
define( 'FONTYS_SP_URL', plugin_dir_url( __FILE__ ) );
define( 'FONTYS_SP_OPTION', 'fontys_studieplanner_catalogus' );
define( 'FONTYS_SP_OPTION_BACKUPS', 'fontys_studieplanner_backups' );

/**
 * Welke WordPress-rechten nodig zijn om het aanbod te beheren.
 * Aan te passen met: add_filter( 'fontys_studieplanner_capability', fn() => 'edit_pages' );
 */
function fontys_sp_capability() {
	return apply_filters( 'fontys_studieplanner_capability', 'manage_options' );
}

/* -------------------------------------------------------------------------
 * Catalogus (het aanbod van EvL's). Dit is het enige dat de plugin opslaat.
 * ---------------------------------------------------------------------- */

function fontys_sp_default_catalogus() {
	$json = file_get_contents( FONTYS_SP_DIR . 'assets/catalogus.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	$data = json_decode( (string) $json, true );
	return is_array( $data ) ? $data : array( 'evls' => array() );
}

function fontys_sp_get_catalogus() {
	$cat = get_option( FONTYS_SP_OPTION );
	return is_array( $cat ) ? $cat : fontys_sp_default_catalogus();
}

register_activation_hook(
	__FILE__,
	function () {
		if ( false === get_option( FONTYS_SP_OPTION ) ) {
			add_option( FONTYS_SP_OPTION, fontys_sp_default_catalogus(), '', false );
		}
	}
);

/* ---------- controleren en opschonen van een catalogus ---------- */

function fontys_sp_is_iso( $v ) {
	return is_string( $v ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v );
}

function fontys_sp_int_list( $v, $min, $max ) {
	$out = array();
	foreach ( (array) $v as $x ) {
		$x = (int) $x;
		if ( $x >= $min && $x <= $max ) {
			$out[] = $x;
		}
	}
	return array_values( array_unique( $out ) );
}

/**
 * Geeft een foutmelding (string) of null als de catalogus bruikbaar is.
 */
function fontys_sp_validate_catalogus( $c ) {
	if ( ! is_array( $c ) || ! isset( $c['evls'] ) || ! is_array( $c['evls'] ) ) {
		return 'De catalogus moet een lijst met EvL\'s bevatten.';
	}
	if ( count( $c['evls'] ) > 1000 ) {
		return 'Te veel EvL\'s.';
	}
	$ids = array();
	foreach ( $c['evls'] as $e ) {
		if ( ! is_array( $e ) || empty( $e['id'] ) || ! is_string( $e['id'] ) ) {
			return 'Er is een EvL zonder id.';
		}
		if ( isset( $ids[ $e['id'] ] ) ) {
			return 'Dubbele EvL-id: ' . $e['id'];
		}
		$ids[ $e['id'] ] = true;
		if ( empty( $e['naam'] ) || ! is_string( $e['naam'] ) || '' === trim( $e['naam'] ) ) {
			return 'Er is een EvL zonder naam.';
		}
		if ( ! in_array( (int) ( $e['ec'] ?? 0 ), array( 15, 30 ), true ) ) {
			return 'EC moet 15 of 30 zijn (' . $e['naam'] . ').';
		}
		$in  = $e['ingangsdatum'] ?? '';
		$uit = $e['sluitingsdatum'] ?? '';
		if ( fontys_sp_is_iso( $in ) && fontys_sp_is_iso( $uit ) && $in > $uit ) {
			return 'Ingangsdatum ligt na de sluitingsdatum (' . $e['naam'] . ').';
		}
	}
	$j1 = (int) ( $c['eersteSchooljaar'] ?? 0 );
	$j2 = (int) ( $c['laatsteSchooljaar'] ?? 0 );
	if ( $j1 < 2000 || $j2 > 2100 || $j1 > $j2 ) {
		return 'Ongeldige schooljaren.';
	}
	return null;
}

/**
 * Neemt alleen bekende velden over en schoont ze op (verdediging in de diepte:
 * de JavaScript escapet bij het tonen ook alles).
 */
function fontys_sp_sanitize_catalogus( $c ) {
	$kleuren = array( '#663366', '#855c85', '#e5007d', '#0076e0', '#0099cc', '#008387', '#339933', '#39b54a', '#ee7425', '#ff9900', '#ffcc00' );
	$md      = function ( $v, $standaard ) {
		return ( is_string( $v ) && preg_match( '/^\d{2}-\d{2}$/', $v ) ) ? $v : $standaard;
	};

	$out = array(
		'opleiding'         => sanitize_text_field( $c['opleiding'] ?? 'Opleiding' ),
		'instituut'         => sanitize_text_field( $c['instituut'] ?? 'Fontys' ),
		'versie'            => sanitize_text_field( $c['versie'] ?? '' ),
		'totaalEC'          => max( 0, (int) ( $c['totaalEC'] ?? 240 ) ),
		'eersteSchooljaar'  => (int) $c['eersteSchooljaar'],
		'laatsteSchooljaar' => (int) $c['laatsteSchooljaar'],
		'periodeStart'      => array(),
		'jaarEinde'         => $md( $c['jaarEinde'] ?? '', '07-10' ),
		'periodeData'       => array(),
		'datumsOnbekend'    => fontys_sp_int_list( $c['datumsOnbekend'] ?? array(), 2000, 2100 ),
		'evls'              => array(),
	);
	$std = array( '09-01', '11-09', '02-01', '04-19' );
	for ( $k = 0; $k < 4; $k++ ) {
		$out['periodeStart'][] = $md( $c['periodeStart'][ $k ] ?? '', $std[ $k ] );
	}
	foreach ( (array) ( $c['periodeData'] ?? array() ) as $jaar => $rij ) {
		$jaar = (int) $jaar;
		if ( $jaar < 2000 || $jaar > 2100 ) {
			continue;
		}
		$schoon = array();
		for ( $k = 0; $k < 5; $k++ ) {
			$v        = $rij[ $k ] ?? '';
			$schoon[] = fontys_sp_is_iso( $v ) ? $v : '';
		}
		$out['periodeData'][ (string) $jaar ] = $schoon;
	}
	if ( empty( $out['periodeData'] ) ) {
		$out['periodeData'] = new stdClass(); // blijft een object in JSON
	}

	foreach ( $c['evls'] as $e ) {
		$ec    = 30 === (int) $e['ec'] ? 30 : 15;
		$aanbod = array();
		foreach ( array( 'fysiek', 'lwo' ) as $lw ) {
			$a     = $e['aanbod'][ $lw ] ?? array();
			$modus = in_array( $a['modus'] ?? '', array( 'geen', 'doorlopend', 'jaarlijks', 'specifiek' ), true ) ? $a['modus'] : 'geen';
			$per   = fontys_sp_int_list( $a['periodes'] ?? array(), 1, 4 );
			$mom   = array();
			foreach ( (array) ( $a['momenten'] ?? array() ) as $m ) {
				if ( is_string( $m ) && preg_match( '/^\d{4}-[1-4]$/', $m ) ) {
					$mom[] = $m;
				}
			}
			if ( 30 === $ec ) { // 30 EC start altijd in P1 of P3
				$per = array_values( array_intersect( $per, array( 1, 3 ) ) );
				$mom = array_values( array_filter( $mom, fn( $m ) => (bool) preg_match( '/-[13]$/', $m ) ) );
			}
			$aanbod[ $lw ] = array(
				'modus'    => $modus,
				'periodes' => $per,
				'momenten' => array_values( array_unique( $mom ) ),
			);
		}
		$contacten = array();
		foreach ( (array) ( $e['contacten'] ?? array() ) as $ct ) {
			$naam  = sanitize_text_field( $ct['naam'] ?? '' );
			$email = sanitize_email( $ct['email'] ?? '' );
			if ( '' !== $naam || '' !== $email ) {
				$contacten[] = array( 'naam' => $naam, 'email' => $email );
			}
		}
		$vereist = array();
		foreach ( (array) ( $e['vereist'] ?? array() ) as $r ) {
			if ( is_string( $r ) ) {
				$vereist[] = preg_replace( '/[^A-Za-z0-9_-]/', '', $r );
			}
		}
		$kleur        = strtolower( (string) ( $e['kleur'] ?? '' ) );
		$out['evls'][] = array(
			'id'             => preg_replace( '/[^A-Za-z0-9_-]/', '', $e['id'] ),
			'code'           => sanitize_text_field( $e['code'] ?? '' ),
			'naam'           => sanitize_text_field( $e['naam'] ),
			'ec'             => $ec,
			'categorie'      => sanitize_text_field( $e['categorie'] ?? '' ),
			'verplicht'      => ! empty( $e['verplicht'] ),
			'beschrijving'   => sanitize_textarea_field( $e['beschrijving'] ?? '' ),
			'kleur'          => in_array( $kleur, $kleuren, true ) ? $kleur : '',
			'ingangsdatum'   => fontys_sp_is_iso( $e['ingangsdatum'] ?? '' ) ? $e['ingangsdatum'] : '',
			'sluitingsdatum' => fontys_sp_is_iso( $e['sluitingsdatum'] ?? '' ) ? $e['sluitingsdatum'] : '',
			'onbekendeJaren' => fontys_sp_int_list( $e['onbekendeJaren'] ?? array(), 2000, 2100 ),
			'vereist'        => array_values( array_filter( $vereist ) ),
			'contacten'      => $contacten,
			'aanbod'         => $aanbod,
		);
	}
	return $out;
}

/* ---------- REST: alleen opslaan door beheerders ---------- */

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'fontys-studieplanner/v1',
			'/catalogus',
			array(
				'methods'             => 'POST',
				'callback'            => 'fontys_sp_rest_opslaan',
				'permission_callback' => function () {
					return current_user_can( fontys_sp_capability() );
				},
			)
		);
	}
);

function fontys_sp_rest_opslaan( WP_REST_Request $request ) {
	if ( strlen( (string) $request->get_body() ) > 2 * 1024 * 1024 ) {
		return new WP_Error( 'sp_te_groot', 'De catalogus is te groot.', array( 'status' => 413 ) );
	}
	$c   = $request->get_json_params();
	$err = fontys_sp_validate_catalogus( $c );
	if ( $err ) {
		return new WP_Error( 'sp_ongeldig', $err, array( 'status' => 400 ) );
	}
	$c           = fontys_sp_sanitize_catalogus( $c );
	$c['versie'] = gmdate( 'Y-m-d' ) . '.' . base_convert( (string) time(), 10, 36 );

	// Vorige versie bewaren (laatste 20), zodat een fout terug te draaien is.
	$vorige = get_option( FONTYS_SP_OPTION );
	if ( is_array( $vorige ) ) {
		$backups = get_option( FONTYS_SP_OPTION_BACKUPS, array() );
		$backups = is_array( $backups ) ? $backups : array();
		array_unshift(
			$backups,
			array(
				'opgeslagen' => current_time( 'mysql' ),
				'door'       => wp_get_current_user()->user_login,
				'catalogus'  => $vorige,
			)
		);
		update_option( FONTYS_SP_OPTION_BACKUPS, array_slice( $backups, 0, 20 ), false );
	}
	update_option( FONTYS_SP_OPTION, $c, false );
	return rest_ensure_response( array( 'ok' => true, 'versie' => $c['versie'] ) );
}

/* -------------------------------------------------------------------------
 * Scripts en stijl
 * ---------------------------------------------------------------------- */

add_action(
	'init',
	function () {
		$u = FONTYS_SP_URL . 'assets/';
		$v = FONTYS_SP_VERSION;
		wp_register_style( 'sp-studieplanner', $u . 'studieplanner.css', array(), $v );
		wp_register_script( 'sp-jspdf', $u . 'vendor/jspdf.umd.min.js', array(), '4.2.1', true );
		wp_register_script( 'sp-autotable', $u . 'vendor/jspdf.plugin.autotable.min.js', array( 'sp-jspdf' ), '5.0.9', true );
		wp_register_script( 'sp-common', $u . 'common.js', array(), $v, true );
		wp_register_script( 'sp-planner', $u . 'planner.js', array( 'sp-common', 'sp-autotable' ), $v, true );
		wp_register_script( 'sp-pdf', $u . 'pdf.js', array( 'sp-planner' ), $v, true );
		wp_register_script( 'sp-beheer', $u . 'beheer.js', array( 'sp-common' ), $v, true );
	}
);

function fontys_sp_catalogus_script_tag() {
	$json = wp_json_encode( fontys_sp_get_catalogus(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE );
	return '<script type="application/json" id="catalogus-data">' . $json . '</script>';
}

/* -------------------------------------------------------------------------
 * Shortcode [studieplanner]
 * ---------------------------------------------------------------------- */

add_shortcode(
	'studieplanner',
	function ( $atts ) {
		$atts = shortcode_atts( array( 'breedte' => 'breed' ), $atts, 'studieplanner' );
		static $al_getoond = false;
		if ( $al_getoond ) {
			return '<p>' . esc_html__( 'De studieplanner kan maar één keer per pagina getoond worden.', 'fontys-studieplanner' ) . '</p>';
		}
		$al_getoond = true;
		wp_enqueue_style( 'sp-studieplanner' );
		wp_enqueue_script( 'sp-pdf' );
		ob_start();
		// Standaard breder dan de tekstkolom van het thema (de planner heeft ruimte nodig).
		$klasse = 'normaal' === $atts['breedte'] ? '' : ' sp-breed alignfull';
		echo '<div class="sp-app sp-planner' . esc_attr( $klasse ) . '" data-wp="1">';
		echo fontys_sp_catalogus_script_tag(); // phpcs:ignore WordPress.Security.EscapeOutput -- JSON met JSON_HEX_TAG
		include FONTYS_SP_DIR . 'templates/planner.html';
		echo '</div>';
		return ob_get_clean();
	}
);

/* -------------------------------------------------------------------------
 * Beheerpagina in het dashboard
 * ---------------------------------------------------------------------- */

add_action(
	'admin_menu',
	function () {
		add_menu_page(
			__( 'Studieplanner', 'fontys-studieplanner' ),
			__( 'Studieplanner', 'fontys-studieplanner' ),
			fontys_sp_capability(),
			'fontys-studieplanner',
			'fontys_sp_beheer_pagina',
			'dashicons-calendar-alt',
			58
		);
	}
);

add_action(
	'admin_enqueue_scripts',
	function ( $hook ) {
		if ( 'toplevel_page_fontys-studieplanner' !== $hook ) {
			return;
		}
		wp_enqueue_style( 'sp-studieplanner' );
		wp_enqueue_script( 'sp-beheer' );
		wp_add_inline_script(
			'sp-beheer',
			'window.SP_WP = ' . wp_json_encode(
				array(
					'restUrl' => esc_url_raw( rest_url( 'fontys-studieplanner/v1/catalogus' ) ),
					'nonce'   => wp_create_nonce( 'wp_rest' ),
				)
			) . ';',
			'before'
		);
	}
);

function fontys_sp_beheer_pagina() {
	if ( ! current_user_can( fontys_sp_capability() ) ) {
		wp_die( esc_html__( 'Je hebt geen toegang tot deze pagina.', 'fontys-studieplanner' ) );
	}
	echo '<div class="sp-uitleg-wp notice notice-info inline"><p>';
	echo wp_kses_post(
		__( 'Zet de planner op een pagina met de shortcode <code>[studieplanner]</code> (bijvoorbeeld in een Shortcode-blok). Wijzigingen in het aanbod zijn direct zichtbaar voor studenten na <strong>Opslaan</strong>. Er worden geen studentgegevens opgeslagen.', 'fontys-studieplanner' )
	);
	echo '</p></div>';
	echo '<div class="sp-app sp-beheer" data-wp="1">';
	echo fontys_sp_catalogus_script_tag(); // phpcs:ignore WordPress.Security.EscapeOutput -- JSON met JSON_HEX_TAG
	include FONTYS_SP_DIR . 'templates/beheer.html';
	echo '</div>';
}

/* Link naar beheer vanuit de pluginlijst. */
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=fontys-studieplanner' ) ) . '">' . esc_html__( 'Aanbod beheren', 'fontys-studieplanner' ) . '</a>' );
		return $links;
	}
);
