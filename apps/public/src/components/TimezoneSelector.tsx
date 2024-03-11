export function TimezoneSelector() {
  return (
    <select
      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
      id="tz-select"
      name="site[timezone]"
    >
      <option offset="720" value="Etc/GMT+12">
        (GMT-12:00) Etc/GMT+12
      </option>
      <option offset="660" value="US/Samoa">
        (GMT-11:00) US/Samoa
      </option>
      <option offset="660" value="Pacific/Samoa">
        (GMT-11:00) Pacific/Samoa
      </option>
      <option offset="660" value="Pacific/Pago_Pago">
        (GMT-11:00) Pacific/Pago_Pago
      </option>
      <option offset="660" value="Pacific/Niue">
        (GMT-11:00) Pacific/Niue
      </option>
      <option offset="660" value="Pacific/Midway">
        (GMT-11:00) Pacific/Midway
      </option>
      <option offset="660" value="Etc/GMT+11">
        (GMT-11:00) Etc/GMT+11
      </option>
      <option offset="600" value="US/Hawaii">
        (GMT-10:00) US/Hawaii
      </option>
      <option offset="600" value="US/Aleutian">
        (GMT-10:00) US/Aleutian
      </option>
      <option offset="600" value="Pacific/Tahiti">
        (GMT-10:00) Pacific/Tahiti
      </option>
      <option offset="600" value="Pacific/Rarotonga">
        (GMT-10:00) Pacific/Rarotonga
      </option>
      <option offset="600" value="Pacific/Johnston">
        (GMT-10:00) Pacific/Johnston
      </option>
      <option offset="600" value="Pacific/Honolulu">
        (GMT-10:00) Pacific/Honolulu
      </option>
      <option offset="600" value="HST">
        (GMT-10:00) HST
      </option>
      <option offset="600" value="Etc/GMT+10">
        (GMT-10:00) Etc/GMT+10
      </option>
      <option offset="600" value="America/Atka">
        (GMT-10:00) America/Atka
      </option>
      <option offset="600" value="America/Adak">
        (GMT-10:00) America/Adak
      </option>
      <option offset="570" value="Pacific/Marquesas">
        (GMT-09:-30) Pacific/Marquesas
      </option>
      <option offset="540" value="US/Alaska">
        (GMT-09:00) US/Alaska
      </option>
      <option offset="540" value="Pacific/Gambier">
        (GMT-09:00) Pacific/Gambier
      </option>
      <option offset="540" value="Etc/GMT+9">
        (GMT-09:00) Etc/GMT+9
      </option>
      <option offset="540" value="America/Yakutat">
        (GMT-09:00) America/Yakutat
      </option>
      <option offset="540" value="America/Sitka">
        (GMT-09:00) America/Sitka
      </option>
      <option offset="540" value="America/Nome">
        (GMT-09:00) America/Nome
      </option>
      <option offset="540" value="America/Metlakatla">
        (GMT-09:00) America/Metlakatla
      </option>
      <option offset="540" value="America/Juneau">
        (GMT-09:00) America/Juneau
      </option>
      <option offset="540" value="America/Anchorage">
        (GMT-09:00) America/Anchorage
      </option>
      <option offset="480" value="US/Pacific">
        (GMT-08:00) US/Pacific
      </option>
      <option offset="480" value="Pacific/Pitcairn">
        (GMT-08:00) Pacific/Pitcairn
      </option>
      <option offset="480" value="PST8PDT">
        (GMT-08:00) PST8PDT
      </option>
      <option offset="480" value="Mexico/BajaNorte">
        (GMT-08:00) Mexico/BajaNorte
      </option>
      <option offset="480" value="Etc/GMT+8">
        (GMT-08:00) Etc/GMT+8
      </option>
      <option offset="480" value="Canada/Pacific">
        (GMT-08:00) Canada/Pacific
      </option>
      <option offset="480" value="America/Vancouver">
        (GMT-08:00) America/Vancouver
      </option>
      <option offset="480" value="America/Tijuana">
        (GMT-08:00) America/Tijuana
      </option>
      <option offset="480" value="America/Santa_Isabel">
        (GMT-08:00) America/Santa_Isabel
      </option>
      <option offset="480" value="America/Los_Angeles">
        (GMT-08:00) America/Los_Angeles
      </option>
      <option offset="480" value="America/Ensenada">
        (GMT-08:00) America/Ensenada
      </option>
      <option offset="420" value="US/Mountain">
        (GMT-07:00) US/Mountain
      </option>
      <option offset="420" value="US/Arizona">
        (GMT-07:00) US/Arizona
      </option>
      <option offset="420" value="Navajo">
        (GMT-07:00) Navajo
      </option>
      <option offset="420" value="Mexico/BajaSur">
        (GMT-07:00) Mexico/BajaSur
      </option>
      <option offset="420" value="MST7MDT">
        (GMT-07:00) MST7MDT
      </option>
      <option offset="420" value="MST">
        (GMT-07:00) MST
      </option>
      <option offset="420" value="Etc/GMT+7">
        (GMT-07:00) Etc/GMT+7
      </option>
      <option offset="420" value="Canada/Yukon">
        (GMT-07:00) Canada/Yukon
      </option>
      <option offset="420" value="Canada/Mountain">
        (GMT-07:00) Canada/Mountain
      </option>
      <option offset="420" value="America/Yellowknife">
        (GMT-07:00) America/Yellowknife
      </option>
      <option offset="420" value="America/Whitehorse">
        (GMT-07:00) America/Whitehorse
      </option>
      <option offset="420" value="America/Shiprock">
        (GMT-07:00) America/Shiprock
      </option>
      <option offset="420" value="America/Phoenix">
        (GMT-07:00) America/Phoenix
      </option>
      <option offset="420" value="America/Mazatlan">
        (GMT-07:00) America/Mazatlan
      </option>
      <option offset="420" value="America/Inuvik">
        (GMT-07:00) America/Inuvik
      </option>
      <option offset="420" value="America/Hermosillo">
        (GMT-07:00) America/Hermosillo
      </option>
      <option offset="420" value="America/Fort_Nelson">
        (GMT-07:00) America/Fort_Nelson
      </option>
      <option offset="420" value="America/Edmonton">
        (GMT-07:00) America/Edmonton
      </option>
      <option offset="420" value="America/Denver">
        (GMT-07:00) America/Denver
      </option>
      <option offset="420" value="America/Dawson_Creek">
        (GMT-07:00) America/Dawson_Creek
      </option>
      <option offset="420" value="America/Dawson">
        (GMT-07:00) America/Dawson
      </option>
      <option offset="420" value="America/Creston">
        (GMT-07:00) America/Creston
      </option>
      <option offset="420" value="America/Ciudad_Juarez">
        (GMT-07:00) America/Ciudad_Juarez
      </option>
      <option offset="420" value="America/Cambridge_Bay">
        (GMT-07:00) America/Cambridge_Bay
      </option>
      <option offset="420" value="America/Boise">
        (GMT-07:00) America/Boise
      </option>
      <option offset="360" value="US/Indiana-Starke">
        (GMT-06:00) US/Indiana-Starke
      </option>
      <option offset="360" value="US/Central">
        (GMT-06:00) US/Central
      </option>
      <option offset="360" value="Pacific/Galapagos">
        (GMT-06:00) Pacific/Galapagos
      </option>
      <option offset="360" value="Mexico/General">
        (GMT-06:00) Mexico/General
      </option>
      <option offset="360" value="Etc/GMT+6">
        (GMT-06:00) Etc/GMT+6
      </option>
      <option offset="360" value="Canada/Saskatchewan">
        (GMT-06:00) Canada/Saskatchewan
      </option>
      <option offset="360" value="Canada/Central">
        (GMT-06:00) Canada/Central
      </option>
      <option offset="360" value="CST6CDT">
        (GMT-06:00) CST6CDT
      </option>
      <option offset="360" value="America/Winnipeg">
        (GMT-06:00) America/Winnipeg
      </option>
      <option offset="360" value="America/Tegucigalpa">
        (GMT-06:00) America/Tegucigalpa
      </option>
      <option offset="360" value="America/Swift_Current">
        (GMT-06:00) America/Swift_Current
      </option>
      <option offset="360" value="America/Resolute">
        (GMT-06:00) America/Resolute
      </option>
      <option offset="360" value="America/Regina">
        (GMT-06:00) America/Regina
      </option>
      <option offset="360" value="America/Rankin_Inlet">
        (GMT-06:00) America/Rankin_Inlet
      </option>
      <option offset="360" value="America/Rainy_River">
        (GMT-06:00) America/Rainy_River
      </option>
      <option offset="360" value="America/Ojinaga">
        (GMT-06:00) America/Ojinaga
      </option>
      <option offset="360" value="America/North_Dakota/New_Salem">
        (GMT-06:00) America/North_Dakota/New_Salem
      </option>
      <option offset="360" value="America/North_Dakota/Center">
        (GMT-06:00) America/North_Dakota/Center
      </option>
      <option offset="360" value="America/North_Dakota/Beulah">
        (GMT-06:00) America/North_Dakota/Beulah
      </option>
      <option offset="360" value="America/Monterrey">
        (GMT-06:00) America/Monterrey
      </option>
      <option offset="360" value="America/Mexico_City">
        (GMT-06:00) America/Mexico_City
      </option>
      <option offset="360" value="America/Merida">
        (GMT-06:00) America/Merida
      </option>
      <option offset="360" value="America/Menominee">
        (GMT-06:00) America/Menominee
      </option>
      <option offset="360" value="America/Matamoros">
        (GMT-06:00) America/Matamoros
      </option>
      <option offset="360" value="America/Managua">
        (GMT-06:00) America/Managua
      </option>
      <option offset="360" value="America/Knox_IN">
        (GMT-06:00) America/Knox_IN
      </option>
      <option offset="360" value="America/Indiana/Tell_City">
        (GMT-06:00) America/Indiana/Tell_City
      </option>
      <option offset="360" value="America/Indiana/Knox">
        (GMT-06:00) America/Indiana/Knox
      </option>
      <option offset="360" value="America/Guatemala">
        (GMT-06:00) America/Guatemala
      </option>
      <option offset="360" value="America/El_Salvador">
        (GMT-06:00) America/El_Salvador
      </option>
      <option offset="360" value="America/Costa_Rica">
        (GMT-06:00) America/Costa_Rica
      </option>
      <option offset="360" value="America/Chihuahua">
        (GMT-06:00) America/Chihuahua
      </option>
      <option offset="360" value="America/Chicago">
        (GMT-06:00) America/Chicago
      </option>
      <option offset="360" value="America/Belize">
        (GMT-06:00) America/Belize
      </option>
      <option offset="360" value="America/Bahia_Banderas">
        (GMT-06:00) America/Bahia_Banderas
      </option>
      <option offset="300" value="US/Michigan">
        (GMT-05:00) US/Michigan
      </option>
      <option offset="300" value="US/Eastern">
        (GMT-05:00) US/Eastern
      </option>
      <option offset="300" value="US/East-Indiana">
        (GMT-05:00) US/East-Indiana
      </option>
      <option offset="300" value="Pacific/Easter">
        (GMT-05:00) Pacific/Easter
      </option>
      <option offset="300" value="Jamaica">
        (GMT-05:00) Jamaica
      </option>
      <option offset="300" value="Etc/GMT+5">
        (GMT-05:00) Etc/GMT+5
      </option>
      <option offset="300" value="EST5EDT">
        (GMT-05:00) EST5EDT
      </option>
      <option offset="300" value="EST">
        (GMT-05:00) EST
      </option>
      <option offset="300" value="Cuba">
        (GMT-05:00) Cuba
      </option>
      <option offset="300" value="Chile/EasterIsland">
        (GMT-05:00) Chile/EasterIsland
      </option>
      <option offset="300" value="Canada/Eastern">
        (GMT-05:00) Canada/Eastern
      </option>
      <option offset="300" value="Brazil/Acre">
        (GMT-05:00) Brazil/Acre
      </option>
      <option offset="300" value="America/Toronto">
        (GMT-05:00) America/Toronto
      </option>
      <option offset="300" value="America/Thunder_Bay">
        (GMT-05:00) America/Thunder_Bay
      </option>
      <option offset="300" value="America/Rio_Branco">
        (GMT-05:00) America/Rio_Branco
      </option>
      <option offset="300" value="America/Porto_Acre">
        (GMT-05:00) America/Porto_Acre
      </option>
      <option offset="300" value="America/Port-au-Prince">
        (GMT-05:00) America/Port-au-Prince
      </option>
      <option offset="300" value="America/Pangnirtung">
        (GMT-05:00) America/Pangnirtung
      </option>
      <option offset="300" value="America/Panama">
        (GMT-05:00) America/Panama
      </option>
      <option offset="300" value="America/Nipigon">
        (GMT-05:00) America/Nipigon
      </option>
      <option offset="300" value="America/New_York">
        (GMT-05:00) America/New_York
      </option>
      <option offset="300" value="America/Nassau">
        (GMT-05:00) America/Nassau
      </option>
      <option offset="300" value="America/Montreal">
        (GMT-05:00) America/Montreal
      </option>
      <option offset="300" value="America/Louisville">
        (GMT-05:00) America/Louisville
      </option>
      <option offset="300" value="America/Lima">
        (GMT-05:00) America/Lima
      </option>
      <option offset="300" value="America/Kentucky/Monticello">
        (GMT-05:00) America/Kentucky/Monticello
      </option>
      <option offset="300" value="America/Kentucky/Louisville">
        (GMT-05:00) America/Kentucky/Louisville
      </option>
      <option offset="300" value="America/Jamaica">
        (GMT-05:00) America/Jamaica
      </option>
      <option offset="300" value="America/Iqaluit">
        (GMT-05:00) America/Iqaluit
      </option>
      <option offset="300" value="America/Indianapolis">
        (GMT-05:00) America/Indianapolis
      </option>
      <option offset="300" value="America/Indiana/Winamac">
        (GMT-05:00) America/Indiana/Winamac
      </option>
      <option offset="300" value="America/Indiana/Vincennes">
        (GMT-05:00) America/Indiana/Vincennes
      </option>
      <option offset="300" value="America/Indiana/Vevay">
        (GMT-05:00) America/Indiana/Vevay
      </option>
      <option offset="300" value="America/Indiana/Petersburg">
        (GMT-05:00) America/Indiana/Petersburg
      </option>
      <option offset="300" value="America/Indiana/Marengo">
        (GMT-05:00) America/Indiana/Marengo
      </option>
      <option offset="300" value="America/Indiana/Indianapolis">
        (GMT-05:00) America/Indiana/Indianapolis
      </option>
      <option offset="300" value="America/Havana">
        (GMT-05:00) America/Havana
      </option>
      <option offset="300" value="America/Guayaquil">
        (GMT-05:00) America/Guayaquil
      </option>
      <option offset="300" value="America/Grand_Turk">
        (GMT-05:00) America/Grand_Turk
      </option>
      <option offset="300" value="America/Fort_Wayne">
        (GMT-05:00) America/Fort_Wayne
      </option>
      <option offset="300" value="America/Eirunepe">
        (GMT-05:00) America/Eirunepe
      </option>
      <option offset="300" value="America/Detroit">
        (GMT-05:00) America/Detroit
      </option>
      <option offset="300" value="America/Coral_Harbour">
        (GMT-05:00) America/Coral_Harbour
      </option>
      <option offset="300" value="America/Cayman">
        (GMT-05:00) America/Cayman
      </option>
      <option offset="300" value="America/Cancun">
        (GMT-05:00) America/Cancun
      </option>
      <option offset="300" value="America/Bogota">
        (GMT-05:00) America/Bogota
      </option>
      <option offset="300" value="America/Atikokan">
        (GMT-05:00) America/Atikokan
      </option>
      <option offset="240" value="Etc/GMT+4">
        (GMT-04:00) Etc/GMT+4
      </option>
      <option offset="240" value="Canada/Atlantic">
        (GMT-04:00) Canada/Atlantic
      </option>
      <option offset="240" value="Brazil/West">
        (GMT-04:00) Brazil/West
      </option>
      <option offset="240" value="Atlantic/Bermuda">
        (GMT-04:00) Atlantic/Bermuda
      </option>
      <option offset="240" value="America/Virgin">
        (GMT-04:00) America/Virgin
      </option>
      <option offset="240" value="America/Tortola">
        (GMT-04:00) America/Tortola
      </option>
      <option offset="240" value="America/Thule">
        (GMT-04:00) America/Thule
      </option>
      <option offset="240" value="America/St_Vincent">
        (GMT-04:00) America/St_Vincent
      </option>
      <option offset="240" value="America/St_Thomas">
        (GMT-04:00) America/St_Thomas
      </option>
      <option offset="240" value="America/St_Lucia">
        (GMT-04:00) America/St_Lucia
      </option>
      <option offset="240" value="America/St_Kitts">
        (GMT-04:00) America/St_Kitts
      </option>
      <option offset="240" value="America/St_Barthelemy">
        (GMT-04:00) America/St_Barthelemy
      </option>
      <option offset="240" value="America/Santo_Domingo">
        (GMT-04:00) America/Santo_Domingo
      </option>
      <option offset="240" value="America/Puerto_Rico">
        (GMT-04:00) America/Puerto_Rico
      </option>
      <option offset="240" value="America/Porto_Velho">
        (GMT-04:00) America/Porto_Velho
      </option>
      <option offset="240" value="America/Port_of_Spain">
        (GMT-04:00) America/Port_of_Spain
      </option>
      <option offset="240" value="America/Montserrat">
        (GMT-04:00) America/Montserrat
      </option>
      <option offset="240" value="America/Moncton">
        (GMT-04:00) America/Moncton
      </option>
      <option offset="240" value="America/Martinique">
        (GMT-04:00) America/Martinique
      </option>
      <option offset="240" value="America/Marigot">
        (GMT-04:00) America/Marigot
      </option>
      <option offset="240" value="America/Manaus">
        (GMT-04:00) America/Manaus
      </option>
      <option offset="240" value="America/Lower_Princes">
        (GMT-04:00) America/Lower_Princes
      </option>
      <option offset="240" value="America/La_Paz">
        (GMT-04:00) America/La_Paz
      </option>
      <option offset="240" value="America/Kralendijk">
        (GMT-04:00) America/Kralendijk
      </option>
      <option offset="240" value="America/Halifax">
        (GMT-04:00) America/Halifax
      </option>
      <option offset="240" value="America/Guyana">
        (GMT-04:00) America/Guyana
      </option>
      <option offset="240" value="America/Guadeloupe">
        (GMT-04:00) America/Guadeloupe
      </option>
      <option offset="240" value="America/Grenada">
        (GMT-04:00) America/Grenada
      </option>
      <option offset="240" value="America/Goose_Bay">
        (GMT-04:00) America/Goose_Bay
      </option>
      <option offset="240" value="America/Glace_Bay">
        (GMT-04:00) America/Glace_Bay
      </option>
      <option offset="240" value="America/Dominica">
        (GMT-04:00) America/Dominica
      </option>
      <option offset="240" value="America/Curacao">
        (GMT-04:00) America/Curacao
      </option>
      <option offset="240" value="America/Cuiaba">
        (GMT-04:00) America/Cuiaba
      </option>
      <option offset="240" value="America/Caracas">
        (GMT-04:00) America/Caracas
      </option>
      <option offset="240" value="America/Campo_Grande">
        (GMT-04:00) America/Campo_Grande
      </option>
      <option offset="240" value="America/Boa_Vista">
        (GMT-04:00) America/Boa_Vista
      </option>
      <option offset="240" value="America/Blanc-Sablon">
        (GMT-04:00) America/Blanc-Sablon
      </option>
      <option offset="240" value="America/Barbados">
        (GMT-04:00) America/Barbados
      </option>
      <option offset="240" value="America/Aruba">
        (GMT-04:00) America/Aruba
      </option>
      <option offset="240" value="America/Antigua">
        (GMT-04:00) America/Antigua
      </option>
      <option offset="240" value="America/Anguilla">
        (GMT-04:00) America/Anguilla
      </option>
      <option offset="210" value="Canada/Newfoundland">
        (GMT-03:-30) Canada/Newfoundland
      </option>
      <option offset="210" value="America/St_Johns">
        (GMT-03:-30) America/St_Johns
      </option>
      <option offset="180" value="Etc/GMT+3">
        (GMT-03:00) Etc/GMT+3
      </option>
      <option offset="180" value="Chile/Continental">
        (GMT-03:00) Chile/Continental
      </option>
      <option offset="180" value="Brazil/East">
        (GMT-03:00) Brazil/East
      </option>
      <option offset="180" value="Atlantic/Stanley">
        (GMT-03:00) Atlantic/Stanley
      </option>
      <option offset="180" value="Antarctica/Rothera">
        (GMT-03:00) Antarctica/Rothera
      </option>
      <option offset="180" value="Antarctica/Palmer">
        (GMT-03:00) Antarctica/Palmer
      </option>
      <option offset="180" value="America/Sao_Paulo">
        (GMT-03:00) America/Sao_Paulo
      </option>
      <option offset="180" value="America/Santiago">
        (GMT-03:00) America/Santiago
      </option>
      <option offset="180" value="America/Santarem">
        (GMT-03:00) America/Santarem
      </option>
      <option offset="180" value="America/Rosario">
        (GMT-03:00) America/Rosario
      </option>
      <option offset="180" value="America/Recife">
        (GMT-03:00) America/Recife
      </option>
      <option offset="180" value="America/Punta_Arenas">
        (GMT-03:00) America/Punta_Arenas
      </option>
      <option offset="180" value="America/Paramaribo">
        (GMT-03:00) America/Paramaribo
      </option>
      <option offset="180" value="America/Montevideo">
        (GMT-03:00) America/Montevideo
      </option>
      <option offset="180" value="America/Miquelon">
        (GMT-03:00) America/Miquelon
      </option>
      <option offset="180" value="America/Mendoza">
        (GMT-03:00) America/Mendoza
      </option>
      <option offset="180" value="America/Maceio">
        (GMT-03:00) America/Maceio
      </option>
      <option offset="180" value="America/Jujuy">
        (GMT-03:00) America/Jujuy
      </option>
      <option offset="180" value="America/Fortaleza">
        (GMT-03:00) America/Fortaleza
      </option>
      <option offset="180" value="America/Cordoba">
        (GMT-03:00) America/Cordoba
      </option>
      <option offset="180" value="America/Cayenne">
        (GMT-03:00) America/Cayenne
      </option>
      <option offset="180" value="America/Catamarca">
        (GMT-03:00) America/Catamarca
      </option>
      <option offset="180" value="America/Buenos_Aires">
        (GMT-03:00) America/Buenos_Aires
      </option>
      <option offset="180" value="America/Belem">
        (GMT-03:00) America/Belem
      </option>
      <option offset="180" value="America/Bahia">
        (GMT-03:00) America/Bahia
      </option>
      <option offset="180" value="America/Asuncion">
        (GMT-03:00) America/Asuncion
      </option>
      <option offset="180" value="America/Argentina/Ushuaia">
        (GMT-03:00) America/Argentina/Ushuaia
      </option>
      <option offset="180" value="America/Argentina/Tucuman">
        (GMT-03:00) America/Argentina/Tucuman
      </option>
      <option offset="180" value="America/Argentina/San_Luis">
        (GMT-03:00) America/Argentina/San_Luis
      </option>
      <option offset="180" value="America/Argentina/San_Juan">
        (GMT-03:00) America/Argentina/San_Juan
      </option>
      <option offset="180" value="America/Argentina/Salta">
        (GMT-03:00) America/Argentina/Salta
      </option>
      <option offset="180" value="America/Argentina/Rio_Gallegos">
        (GMT-03:00) America/Argentina/Rio_Gallegos
      </option>
      <option offset="180" value="America/Argentina/Mendoza">
        (GMT-03:00) America/Argentina/Mendoza
      </option>
      <option offset="180" value="America/Argentina/La_Rioja">
        (GMT-03:00) America/Argentina/La_Rioja
      </option>
      <option offset="180" value="America/Argentina/Jujuy">
        (GMT-03:00) America/Argentina/Jujuy
      </option>
      <option offset="180" value="America/Argentina/Cordoba">
        (GMT-03:00) America/Argentina/Cordoba
      </option>
      <option offset="180" value="America/Argentina/ComodRivadavia">
        (GMT-03:00) America/Argentina/ComodRivadavia
      </option>
      <option offset="180" value="America/Argentina/Catamarca">
        (GMT-03:00) America/Argentina/Catamarca
      </option>
      <option offset="180" value="America/Argentina/Buenos_Aires">
        (GMT-03:00) America/Argentina/Buenos_Aires
      </option>
      <option offset="180" value="America/Araguaina">
        (GMT-03:00) America/Araguaina
      </option>
      <option offset="120" value="Etc/GMT+2">
        (GMT-02:00) Etc/GMT+2
      </option>
      <option offset="120" value="Brazil/DeNoronha">
        (GMT-02:00) Brazil/DeNoronha
      </option>
      <option offset="120" value="Atlantic/South_Georgia">
        (GMT-02:00) Atlantic/South_Georgia
      </option>
      <option offset="120" value="America/Nuuk">
        (GMT-02:00) America/Nuuk
      </option>
      <option offset="120" value="America/Noronha">
        (GMT-02:00) America/Noronha
      </option>
      <option offset="120" value="America/Godthab">
        (GMT-02:00) America/Godthab
      </option>
      <option offset="60" value="Etc/GMT+1">
        (GMT-01:00) Etc/GMT+1
      </option>
      <option offset="60" value="Atlantic/Cape_Verde">
        (GMT-01:00) Atlantic/Cape_Verde
      </option>
      <option offset="60" value="Atlantic/Azores">
        (GMT-01:00) Atlantic/Azores
      </option>
      <option offset="60" value="America/Scoresbysund">
        (GMT-01:00) America/Scoresbysund
      </option>
      <option offset="0" value="Zulu">
        (GMT+00:00) Zulu
      </option>
      <option offset="0" value="WET">
        (GMT+00:00) WET
      </option>
      <option offset="0" value="Universal">
        (GMT+00:00) Universal
      </option>
      <option offset="0" value="UTC">
        (GMT+00:00) UTC
      </option>
      <option offset="0" value="UCT">
        (GMT+00:00) UCT
      </option>
      <option offset="0" value="Portugal">
        (GMT+00:00) Portugal
      </option>
      <option offset="0" value="Iceland">
        (GMT+00:00) Iceland
      </option>
      <option offset="0" value="Greenwich">
        (GMT+00:00) Greenwich
      </option>
      <option offset="0" value="GMT0">
        (GMT+00:00) GMT0
      </option>
      <option offset="0" value="GMT-0">
        (GMT+00:00) GMT-0
      </option>
      <option offset="0" value="GMT+0">
        (GMT+00:00) GMT+0
      </option>
      <option offset="0" value="GMT">
        (GMT+00:00) GMT
      </option>
      <option offset="0" value="GB-Eire">
        (GMT+00:00) GB-Eire
      </option>
      <option offset="0" value="GB">
        (GMT+00:00) GB
      </option>
      <option offset="0" value="Europe/London">
        (GMT+00:00) Europe/London
      </option>
      <option offset="0" value="Europe/Lisbon">
        (GMT+00:00) Europe/Lisbon
      </option>
      <option offset="0" value="Europe/Jersey">
        (GMT+00:00) Europe/Jersey
      </option>
      <option offset="0" value="Europe/Isle_of_Man">
        (GMT+00:00) Europe/Isle_of_Man
      </option>
      <option offset="0" value="Europe/Guernsey">
        (GMT+00:00) Europe/Guernsey
      </option>
      <option offset="0" value="Europe/Dublin">
        (GMT+00:00) Europe/Dublin
      </option>
      <option offset="0" value="Europe/Belfast">
        (GMT+00:00) Europe/Belfast
      </option>
      <option offset="0" value="Etc/Zulu">
        (GMT+00:00) Etc/Zulu
      </option>
      <option offset="0" value="Etc/Universal">
        (GMT+00:00) Etc/Universal
      </option>
      <option offset="0" value="Etc/UTC">
        (GMT+00:00) Etc/UTC
      </option>
      <option offset="0" value="Etc/UCT">
        (GMT+00:00) Etc/UCT
      </option>
      <option offset="0" selected="" value="Etc/Greenwich">
        (GMT+00:00) Etc/Greenwich
      </option>
      <option offset="0" value="Etc/GMT0">
        (GMT+00:00) Etc/GMT0
      </option>
      <option offset="0" value="Etc/GMT-0">
        (GMT+00:00) Etc/GMT-0
      </option>
      <option offset="0" value="Etc/GMT+0">
        (GMT+00:00) Etc/GMT+0
      </option>
      <option offset="0" value="Etc/GMT">
        (GMT+00:00) Etc/GMT
      </option>
      <option offset="0" value="Eire">
        (GMT+00:00) Eire
      </option>
      <option offset="0" value="Atlantic/St_Helena">
        (GMT+00:00) Atlantic/St_Helena
      </option>
      <option offset="0" value="Atlantic/Reykjavik">
        (GMT+00:00) Atlantic/Reykjavik
      </option>
      <option offset="0" value="Atlantic/Madeira">
        (GMT+00:00) Atlantic/Madeira
      </option>
      <option offset="0" value="Atlantic/Faroe">
        (GMT+00:00) Atlantic/Faroe
      </option>
      <option offset="0" value="Atlantic/Faeroe">
        (GMT+00:00) Atlantic/Faeroe
      </option>
      <option offset="0" value="Atlantic/Canary">
        (GMT+00:00) Atlantic/Canary
      </option>
      <option offset="0" value="Antarctica/Troll">
        (GMT+00:00) Antarctica/Troll
      </option>
      <option offset="0" value="America/Danmarkshavn">
        (GMT+00:00) America/Danmarkshavn
      </option>
      <option offset="0" value="Africa/Timbuktu">
        (GMT+00:00) Africa/Timbuktu
      </option>
      <option offset="0" value="Africa/Sao_Tome">
        (GMT+00:00) Africa/Sao_Tome
      </option>
      <option offset="0" value="Africa/Ouagadougou">
        (GMT+00:00) Africa/Ouagadougou
      </option>
      <option offset="0" value="Africa/Nouakchott">
        (GMT+00:00) Africa/Nouakchott
      </option>
      <option offset="0" value="Africa/Monrovia">
        (GMT+00:00) Africa/Monrovia
      </option>
      <option offset="0" value="Africa/Lome">
        (GMT+00:00) Africa/Lome
      </option>
      <option offset="0" value="Africa/Freetown">
        (GMT+00:00) Africa/Freetown
      </option>
      <option offset="0" value="Africa/Dakar">
        (GMT+00:00) Africa/Dakar
      </option>
      <option offset="0" value="Africa/Conakry">
        (GMT+00:00) Africa/Conakry
      </option>
      <option offset="0" value="Africa/Bissau">
        (GMT+00:00) Africa/Bissau
      </option>
      <option offset="0" value="Africa/Banjul">
        (GMT+00:00) Africa/Banjul
      </option>
      <option offset="0" value="Africa/Bamako">
        (GMT+00:00) Africa/Bamako
      </option>
      <option offset="0" value="Africa/Accra">
        (GMT+00:00) Africa/Accra
      </option>
      <option offset="0" value="Africa/Abidjan">
        (GMT+00:00) Africa/Abidjan
      </option>
      <option offset="-60" value="Poland">
        (GMT+01:00) Poland
      </option>
      <option offset="-60" value="MET">
        (GMT+01:00) MET
      </option>
      <option offset="-60" value="Europe/Zurich">
        (GMT+01:00) Europe/Zurich
      </option>
      <option offset="-60" value="Europe/Zagreb">
        (GMT+01:00) Europe/Zagreb
      </option>
      <option offset="-60" value="Europe/Warsaw">
        (GMT+01:00) Europe/Warsaw
      </option>
      <option offset="-60" value="Europe/Vienna">
        (GMT+01:00) Europe/Vienna
      </option>
      <option offset="-60" value="Europe/Vatican">
        (GMT+01:00) Europe/Vatican
      </option>
      <option offset="-60" value="Europe/Vaduz">
        (GMT+01:00) Europe/Vaduz
      </option>
      <option offset="-60" value="Europe/Tirane">
        (GMT+01:00) Europe/Tirane
      </option>
      <option offset="-60" value="Europe/Stockholm">
        (GMT+01:00) Europe/Stockholm
      </option>
      <option offset="-60" value="Europe/Skopje">
        (GMT+01:00) Europe/Skopje
      </option>
      <option offset="-60" value="Europe/Sarajevo">
        (GMT+01:00) Europe/Sarajevo
      </option>
      <option offset="-60" value="Europe/San_Marino">
        (GMT+01:00) Europe/San_Marino
      </option>
      <option offset="-60" value="Europe/Rome">
        (GMT+01:00) Europe/Rome
      </option>
      <option offset="-60" value="Europe/Prague">
        (GMT+01:00) Europe/Prague
      </option>
      <option offset="-60" value="Europe/Podgorica">
        (GMT+01:00) Europe/Podgorica
      </option>
      <option offset="-60" value="Europe/Paris">
        (GMT+01:00) Europe/Paris
      </option>
      <option offset="-60" value="Europe/Oslo">
        (GMT+01:00) Europe/Oslo
      </option>
      <option offset="-60" value="Europe/Monaco">
        (GMT+01:00) Europe/Monaco
      </option>
      <option offset="-60" value="Europe/Malta">
        (GMT+01:00) Europe/Malta
      </option>
      <option offset="-60" value="Europe/Madrid">
        (GMT+01:00) Europe/Madrid
      </option>
      <option offset="-60" value="Europe/Luxembourg">
        (GMT+01:00) Europe/Luxembourg
      </option>
      <option offset="-60" value="Europe/Ljubljana">
        (GMT+01:00) Europe/Ljubljana
      </option>
      <option offset="-60" value="Europe/Gibraltar">
        (GMT+01:00) Europe/Gibraltar
      </option>
      <option offset="-60" value="Europe/Copenhagen">
        (GMT+01:00) Europe/Copenhagen
      </option>
      <option offset="-60" value="Europe/Busingen">
        (GMT+01:00) Europe/Busingen
      </option>
      <option offset="-60" value="Europe/Budapest">
        (GMT+01:00) Europe/Budapest
      </option>
      <option offset="-60" value="Europe/Brussels">
        (GMT+01:00) Europe/Brussels
      </option>
      <option offset="-60" value="Europe/Bratislava">
        (GMT+01:00) Europe/Bratislava
      </option>
      <option offset="-60" value="Europe/Berlin">
        (GMT+01:00) Europe/Berlin
      </option>
      <option offset="-60" value="Europe/Belgrade">
        (GMT+01:00) Europe/Belgrade
      </option>
      <option offset="-60" value="Europe/Andorra">
        (GMT+01:00) Europe/Andorra
      </option>
      <option offset="-60" value="Europe/Amsterdam">
        (GMT+01:00) Europe/Amsterdam
      </option>
      <option offset="-60" value="Etc/GMT-1">
        (GMT+01:00) Etc/GMT-1
      </option>
      <option offset="-60" value="CET">
        (GMT+01:00) CET
      </option>
      <option offset="-60" value="Atlantic/Jan_Mayen">
        (GMT+01:00) Atlantic/Jan_Mayen
      </option>
      <option offset="-60" value="Arctic/Longyearbyen">
        (GMT+01:00) Arctic/Longyearbyen
      </option>
      <option offset="-60" value="Africa/Tunis">
        (GMT+01:00) Africa/Tunis
      </option>
      <option offset="-60" value="Africa/Porto-Novo">
        (GMT+01:00) Africa/Porto-Novo
      </option>
      <option offset="-60" value="Africa/Niamey">
        (GMT+01:00) Africa/Niamey
      </option>
      <option offset="-60" value="Africa/Ndjamena">
        (GMT+01:00) Africa/Ndjamena
      </option>
      <option offset="-60" value="Africa/Malabo">
        (GMT+01:00) Africa/Malabo
      </option>
      <option offset="-60" value="Africa/Luanda">
        (GMT+01:00) Africa/Luanda
      </option>
      <option offset="-60" value="Africa/Libreville">
        (GMT+01:00) Africa/Libreville
      </option>
      <option offset="-60" value="Africa/Lagos">
        (GMT+01:00) Africa/Lagos
      </option>
      <option offset="-60" value="Africa/Kinshasa">
        (GMT+01:00) Africa/Kinshasa
      </option>
      <option offset="-60" value="Africa/El_Aaiun">
        (GMT+01:00) Africa/El_Aaiun
      </option>
      <option offset="-60" value="Africa/Douala">
        (GMT+01:00) Africa/Douala
      </option>
      <option offset="-60" value="Africa/Ceuta">
        (GMT+01:00) Africa/Ceuta
      </option>
      <option offset="-60" value="Africa/Casablanca">
        (GMT+01:00) Africa/Casablanca
      </option>
      <option offset="-60" value="Africa/Brazzaville">
        (GMT+01:00) Africa/Brazzaville
      </option>
      <option offset="-60" value="Africa/Bangui">
        (GMT+01:00) Africa/Bangui
      </option>
      <option offset="-60" value="Africa/Algiers">
        (GMT+01:00) Africa/Algiers
      </option>
      <option offset="-120" value="Libya">
        (GMT+02:00) Libya
      </option>
      <option offset="-120" value="Israel">
        (GMT+02:00) Israel
      </option>
      <option offset="-120" value="Europe/Zaporozhye">
        (GMT+02:00) Europe/Zaporozhye
      </option>
      <option offset="-120" value="Europe/Vilnius">
        (GMT+02:00) Europe/Vilnius
      </option>
      <option offset="-120" value="Europe/Uzhgorod">
        (GMT+02:00) Europe/Uzhgorod
      </option>
      <option offset="-120" value="Europe/Tiraspol">
        (GMT+02:00) Europe/Tiraspol
      </option>
      <option offset="-120" value="Europe/Tallinn">
        (GMT+02:00) Europe/Tallinn
      </option>
      <option offset="-120" value="Europe/Sofia">
        (GMT+02:00) Europe/Sofia
      </option>
      <option offset="-120" value="Europe/Riga">
        (GMT+02:00) Europe/Riga
      </option>
      <option offset="-120" value="Europe/Nicosia">
        (GMT+02:00) Europe/Nicosia
      </option>
      <option offset="-120" value="Europe/Mariehamn">
        (GMT+02:00) Europe/Mariehamn
      </option>
      <option offset="-120" value="Europe/Kyiv">
        (GMT+02:00) Europe/Kyiv
      </option>
      <option offset="-120" value="Europe/Kiev">
        (GMT+02:00) Europe/Kiev
      </option>
      <option offset="-120" value="Europe/Kaliningrad">
        (GMT+02:00) Europe/Kaliningrad
      </option>
      <option offset="-120" value="Europe/Helsinki">
        (GMT+02:00) Europe/Helsinki
      </option>
      <option offset="-120" value="Europe/Chisinau">
        (GMT+02:00) Europe/Chisinau
      </option>
      <option offset="-120" value="Europe/Bucharest">
        (GMT+02:00) Europe/Bucharest
      </option>
      <option offset="-120" value="Europe/Athens">
        (GMT+02:00) Europe/Athens
      </option>
      <option offset="-120" value="Etc/GMT-2">
        (GMT+02:00) Etc/GMT-2
      </option>
      <option offset="-120" value="Egypt">
        (GMT+02:00) Egypt
      </option>
      <option offset="-120" value="EET">
        (GMT+02:00) EET
      </option>
      <option offset="-120" value="Asia/Tel_Aviv">
        (GMT+02:00) Asia/Tel_Aviv
      </option>
      <option offset="-120" value="Asia/Nicosia">
        (GMT+02:00) Asia/Nicosia
      </option>
      <option offset="-120" value="Asia/Jerusalem">
        (GMT+02:00) Asia/Jerusalem
      </option>
      <option offset="-120" value="Asia/Hebron">
        (GMT+02:00) Asia/Hebron
      </option>
      <option offset="-120" value="Asia/Gaza">
        (GMT+02:00) Asia/Gaza
      </option>
      <option offset="-120" value="Asia/Famagusta">
        (GMT+02:00) Asia/Famagusta
      </option>
      <option offset="-120" value="Asia/Beirut">
        (GMT+02:00) Asia/Beirut
      </option>
      <option offset="-120" value="Africa/Windhoek">
        (GMT+02:00) Africa/Windhoek
      </option>
      <option offset="-120" value="Africa/Tripoli">
        (GMT+02:00) Africa/Tripoli
      </option>
      <option offset="-120" value="Africa/Mbabane">
        (GMT+02:00) Africa/Mbabane
      </option>
      <option offset="-120" value="Africa/Maseru">
        (GMT+02:00) Africa/Maseru
      </option>
      <option offset="-120" value="Africa/Maputo">
        (GMT+02:00) Africa/Maputo
      </option>
      <option offset="-120" value="Africa/Lusaka">
        (GMT+02:00) Africa/Lusaka
      </option>
      <option offset="-120" value="Africa/Lubumbashi">
        (GMT+02:00) Africa/Lubumbashi
      </option>
      <option offset="-120" value="Africa/Kigali">
        (GMT+02:00) Africa/Kigali
      </option>
      <option offset="-120" value="Africa/Khartoum">
        (GMT+02:00) Africa/Khartoum
      </option>
      <option offset="-120" value="Africa/Juba">
        (GMT+02:00) Africa/Juba
      </option>
      <option offset="-120" value="Africa/Johannesburg">
        (GMT+02:00) Africa/Johannesburg
      </option>
      <option offset="-120" value="Africa/Harare">
        (GMT+02:00) Africa/Harare
      </option>
      <option offset="-120" value="Africa/Gaborone">
        (GMT+02:00) Africa/Gaborone
      </option>
      <option offset="-120" value="Africa/Cairo">
        (GMT+02:00) Africa/Cairo
      </option>
      <option offset="-120" value="Africa/Bujumbura">
        (GMT+02:00) Africa/Bujumbura
      </option>
      <option offset="-120" value="Africa/Blantyre">
        (GMT+02:00) Africa/Blantyre
      </option>
      <option offset="-180" value="W-SU">
        (GMT+03:00) W-SU
      </option>
      <option offset="-180" value="Turkey">
        (GMT+03:00) Turkey
      </option>
      <option offset="-180" value="Indian/Mayotte">
        (GMT+03:00) Indian/Mayotte
      </option>
      <option offset="-180" value="Indian/Comoro">
        (GMT+03:00) Indian/Comoro
      </option>
      <option offset="-180" value="Indian/Antananarivo">
        (GMT+03:00) Indian/Antananarivo
      </option>
      <option offset="-180" value="Europe/Volgograd">
        (GMT+03:00) Europe/Volgograd
      </option>
      <option offset="-180" value="Europe/Simferopol">
        (GMT+03:00) Europe/Simferopol
      </option>
      <option offset="-180" value="Europe/Moscow">
        (GMT+03:00) Europe/Moscow
      </option>
      <option offset="-180" value="Europe/Minsk">
        (GMT+03:00) Europe/Minsk
      </option>
      <option offset="-180" value="Europe/Kirov">
        (GMT+03:00) Europe/Kirov
      </option>
      <option offset="-180" value="Europe/Istanbul">
        (GMT+03:00) Europe/Istanbul
      </option>
      <option offset="-180" value="Etc/GMT-3">
        (GMT+03:00) Etc/GMT-3
      </option>
      <option offset="-180" value="Asia/Riyadh">
        (GMT+03:00) Asia/Riyadh
      </option>
      <option offset="-180" value="Asia/Qatar">
        (GMT+03:00) Asia/Qatar
      </option>
      <option offset="-180" value="Asia/Kuwait">
        (GMT+03:00) Asia/Kuwait
      </option>
      <option offset="-180" value="Asia/Istanbul">
        (GMT+03:00) Asia/Istanbul
      </option>
      <option offset="-180" value="Asia/Damascus">
        (GMT+03:00) Asia/Damascus
      </option>
      <option offset="-180" value="Asia/Bahrain">
        (GMT+03:00) Asia/Bahrain
      </option>
      <option offset="-180" value="Asia/Baghdad">
        (GMT+03:00) Asia/Baghdad
      </option>
      <option offset="-180" value="Asia/Amman">
        (GMT+03:00) Asia/Amman
      </option>
      <option offset="-180" value="Asia/Aden">
        (GMT+03:00) Asia/Aden
      </option>
      <option offset="-180" value="Antarctica/Syowa">
        (GMT+03:00) Antarctica/Syowa
      </option>
      <option offset="-180" value="Africa/Nairobi">
        (GMT+03:00) Africa/Nairobi
      </option>
      <option offset="-180" value="Africa/Mogadishu">
        (GMT+03:00) Africa/Mogadishu
      </option>
      <option offset="-180" value="Africa/Kampala">
        (GMT+03:00) Africa/Kampala
      </option>
      <option offset="-180" value="Africa/Djibouti">
        (GMT+03:00) Africa/Djibouti
      </option>
      <option offset="-180" value="Africa/Dar_es_Salaam">
        (GMT+03:00) Africa/Dar_es_Salaam
      </option>
      <option offset="-180" value="Africa/Asmera">
        (GMT+03:00) Africa/Asmera
      </option>
      <option offset="-180" value="Africa/Asmara">
        (GMT+03:00) Africa/Asmara
      </option>
      <option offset="-180" value="Africa/Addis_Ababa">
        (GMT+03:00) Africa/Addis_Ababa
      </option>
      <option offset="-210" value="Iran">
        (GMT+03:30) Iran
      </option>
      <option offset="-210" value="Asia/Tehran">
        (GMT+03:30) Asia/Tehran
      </option>
      <option offset="-240" value="Indian/Reunion">
        (GMT+04:00) Indian/Reunion
      </option>
      <option offset="-240" value="Indian/Mauritius">
        (GMT+04:00) Indian/Mauritius
      </option>
      <option offset="-240" value="Indian/Mahe">
        (GMT+04:00) Indian/Mahe
      </option>
      <option offset="-240" value="Europe/Ulyanovsk">
        (GMT+04:00) Europe/Ulyanovsk
      </option>
      <option offset="-240" value="Europe/Saratov">
        (GMT+04:00) Europe/Saratov
      </option>
      <option offset="-240" value="Europe/Samara">
        (GMT+04:00) Europe/Samara
      </option>
      <option offset="-240" value="Europe/Astrakhan">
        (GMT+04:00) Europe/Astrakhan
      </option>
      <option offset="-240" value="Etc/GMT-4">
        (GMT+04:00) Etc/GMT-4
      </option>
      <option offset="-240" value="Asia/Yerevan">
        (GMT+04:00) Asia/Yerevan
      </option>
      <option offset="-240" value="Asia/Tbilisi">
        (GMT+04:00) Asia/Tbilisi
      </option>
      <option offset="-240" value="Asia/Muscat">
        (GMT+04:00) Asia/Muscat
      </option>
      <option offset="-240" value="Asia/Dubai">
        (GMT+04:00) Asia/Dubai
      </option>
      <option offset="-240" value="Asia/Baku">
        (GMT+04:00) Asia/Baku
      </option>
      <option offset="-270" value="Asia/Kabul">
        (GMT+04:30) Asia/Kabul
      </option>
      <option offset="-300" value="Indian/Maldives">
        (GMT+05:00) Indian/Maldives
      </option>
      <option offset="-300" value="Indian/Kerguelen">
        (GMT+05:00) Indian/Kerguelen
      </option>
      <option offset="-300" value="Etc/GMT-5">
        (GMT+05:00) Etc/GMT-5
      </option>
      <option offset="-300" value="Asia/Yekaterinburg">
        (GMT+05:00) Asia/Yekaterinburg
      </option>
      <option offset="-300" value="Asia/Tashkent">
        (GMT+05:00) Asia/Tashkent
      </option>
      <option offset="-300" value="Asia/Samarkand">
        (GMT+05:00) Asia/Samarkand
      </option>
      <option offset="-300" value="Asia/Qyzylorda">
        (GMT+05:00) Asia/Qyzylorda
      </option>
      <option offset="-300" value="Asia/Oral">
        (GMT+05:00) Asia/Oral
      </option>
      <option offset="-300" value="Asia/Karachi">
        (GMT+05:00) Asia/Karachi
      </option>
      <option offset="-300" value="Asia/Dushanbe">
        (GMT+05:00) Asia/Dushanbe
      </option>
      <option offset="-300" value="Asia/Atyrau">
        (GMT+05:00) Asia/Atyrau
      </option>
      <option offset="-300" value="Asia/Ashkhabad">
        (GMT+05:00) Asia/Ashkhabad
      </option>
      <option offset="-300" value="Asia/Ashgabat">
        (GMT+05:00) Asia/Ashgabat
      </option>
      <option offset="-300" value="Asia/Aqtobe">
        (GMT+05:00) Asia/Aqtobe
      </option>
      <option offset="-300" value="Asia/Aqtau">
        (GMT+05:00) Asia/Aqtau
      </option>
      <option offset="-300" value="Antarctica/Vostok">
        (GMT+05:00) Antarctica/Vostok
      </option>
      <option offset="-300" value="Antarctica/Mawson">
        (GMT+05:00) Antarctica/Mawson
      </option>
      <option offset="-330" value="Asia/Kolkata">
        (GMT+05:30) Asia/Kolkata
      </option>
      <option offset="-330" value="Asia/Colombo">
        (GMT+05:30) Asia/Colombo
      </option>
      <option offset="-330" value="Asia/Calcutta">
        (GMT+05:30) Asia/Calcutta
      </option>
      <option offset="-345" value="Asia/Katmandu">
        (GMT+05:45) Asia/Katmandu
      </option>
      <option offset="-345" value="Asia/Kathmandu">
        (GMT+05:45) Asia/Kathmandu
      </option>
      <option offset="-360" value="Indian/Chagos">
        (GMT+06:00) Indian/Chagos
      </option>
      <option offset="-360" value="Etc/GMT-6">
        (GMT+06:00) Etc/GMT-6
      </option>
      <option offset="-360" value="Asia/Urumqi">
        (GMT+06:00) Asia/Urumqi
      </option>
      <option offset="-360" value="Asia/Thimphu">
        (GMT+06:00) Asia/Thimphu
      </option>
      <option offset="-360" value="Asia/Thimbu">
        (GMT+06:00) Asia/Thimbu
      </option>
      <option offset="-360" value="Asia/Qostanay">
        (GMT+06:00) Asia/Qostanay
      </option>
      <option offset="-360" value="Asia/Omsk">
        (GMT+06:00) Asia/Omsk
      </option>
      <option offset="-360" value="Asia/Kashgar">
        (GMT+06:00) Asia/Kashgar
      </option>
      <option offset="-360" value="Asia/Dhaka">
        (GMT+06:00) Asia/Dhaka
      </option>
      <option offset="-360" value="Asia/Dacca">
        (GMT+06:00) Asia/Dacca
      </option>
      <option offset="-360" value="Asia/Bishkek">
        (GMT+06:00) Asia/Bishkek
      </option>
      <option offset="-360" value="Asia/Almaty">
        (GMT+06:00) Asia/Almaty
      </option>
      <option offset="-390" value="Indian/Cocos">
        (GMT+06:30) Indian/Cocos
      </option>
      <option offset="-390" value="Asia/Yangon">
        (GMT+06:30) Asia/Yangon
      </option>
      <option offset="-390" value="Asia/Rangoon">
        (GMT+06:30) Asia/Rangoon
      </option>
      <option offset="-420" value="Indian/Christmas">
        (GMT+07:00) Indian/Christmas
      </option>
      <option offset="-420" value="Etc/GMT-7">
        (GMT+07:00) Etc/GMT-7
      </option>
      <option offset="-420" value="Asia/Vientiane">
        (GMT+07:00) Asia/Vientiane
      </option>
      <option offset="-420" value="Asia/Tomsk">
        (GMT+07:00) Asia/Tomsk
      </option>
      <option offset="-420" value="Asia/Saigon">
        (GMT+07:00) Asia/Saigon
      </option>
      <option offset="-420" value="Asia/Pontianak">
        (GMT+07:00) Asia/Pontianak
      </option>
      <option offset="-420" value="Asia/Phnom_Penh">
        (GMT+07:00) Asia/Phnom_Penh
      </option>
      <option offset="-420" value="Asia/Novosibirsk">
        (GMT+07:00) Asia/Novosibirsk
      </option>
      <option offset="-420" value="Asia/Novokuznetsk">
        (GMT+07:00) Asia/Novokuznetsk
      </option>
      <option offset="-420" value="Asia/Krasnoyarsk">
        (GMT+07:00) Asia/Krasnoyarsk
      </option>
      <option offset="-420" value="Asia/Jakarta">
        (GMT+07:00) Asia/Jakarta
      </option>
      <option offset="-420" value="Asia/Hovd">
        (GMT+07:00) Asia/Hovd
      </option>
      <option offset="-420" value="Asia/Ho_Chi_Minh">
        (GMT+07:00) Asia/Ho_Chi_Minh
      </option>
      <option offset="-420" value="Asia/Barnaul">
        (GMT+07:00) Asia/Barnaul
      </option>
      <option offset="-420" value="Asia/Bangkok">
        (GMT+07:00) Asia/Bangkok
      </option>
      <option offset="-420" value="Antarctica/Davis">
        (GMT+07:00) Antarctica/Davis
      </option>
      <option offset="-480" value="Singapore">
        (GMT+08:00) Singapore
      </option>
      <option offset="-480" value="ROC">
        (GMT+08:00) ROC
      </option>
      <option offset="-480" value="PRC">
        (GMT+08:00) PRC
      </option>
      <option offset="-480" value="Hongkong">
        (GMT+08:00) Hongkong
      </option>
      <option offset="-480" value="Etc/GMT-8">
        (GMT+08:00) Etc/GMT-8
      </option>
      <option offset="-480" value="Australia/West">
        (GMT+08:00) Australia/West
      </option>
      <option offset="-480" value="Australia/Perth">
        (GMT+08:00) Australia/Perth
      </option>
      <option offset="-480" value="Asia/Ulan_Bator">
        (GMT+08:00) Asia/Ulan_Bator
      </option>
      <option offset="-480" value="Asia/Ulaanbaatar">
        (GMT+08:00) Asia/Ulaanbaatar
      </option>
      <option offset="-480" value="Asia/Ujung_Pandang">
        (GMT+08:00) Asia/Ujung_Pandang
      </option>
      <option offset="-480" value="Asia/Taipei">
        (GMT+08:00) Asia/Taipei
      </option>
      <option offset="-480" value="Asia/Singapore">
        (GMT+08:00) Asia/Singapore
      </option>
      <option offset="-480" value="Asia/Shanghai">
        (GMT+08:00) Asia/Shanghai
      </option>
      <option offset="-480" value="Asia/Manila">
        (GMT+08:00) Asia/Manila
      </option>
      <option offset="-480" value="Asia/Makassar">
        (GMT+08:00) Asia/Makassar
      </option>
      <option offset="-480" value="Asia/Macau">
        (GMT+08:00) Asia/Macau
      </option>
      <option offset="-480" value="Asia/Macao">
        (GMT+08:00) Asia/Macao
      </option>
      <option offset="-480" value="Asia/Kuching">
        (GMT+08:00) Asia/Kuching
      </option>
      <option offset="-480" value="Asia/Kuala_Lumpur">
        (GMT+08:00) Asia/Kuala_Lumpur
      </option>
      <option offset="-480" value="Asia/Irkutsk">
        (GMT+08:00) Asia/Irkutsk
      </option>
      <option offset="-480" value="Asia/Hong_Kong">
        (GMT+08:00) Asia/Hong_Kong
      </option>
      <option offset="-480" value="Asia/Harbin">
        (GMT+08:00) Asia/Harbin
      </option>
      <option offset="-480" value="Asia/Chungking">
        (GMT+08:00) Asia/Chungking
      </option>
      <option offset="-480" value="Asia/Chongqing">
        (GMT+08:00) Asia/Chongqing
      </option>
      <option offset="-480" value="Asia/Choibalsan">
        (GMT+08:00) Asia/Choibalsan
      </option>
      <option offset="-480" value="Asia/Brunei">
        (GMT+08:00) Asia/Brunei
      </option>
      <option offset="-480" value="Antarctica/Casey">
        (GMT+08:00) Antarctica/Casey
      </option>
      <option offset="-525" value="Australia/Eucla">
        (GMT+08:45) Australia/Eucla
      </option>
      <option offset="-540" value="ROK">
        (GMT+09:00) ROK
      </option>
      <option offset="-540" value="Pacific/Palau">
        (GMT+09:00) Pacific/Palau
      </option>
      <option offset="-540" value="Japan">
        (GMT+09:00) Japan
      </option>
      <option offset="-540" value="Etc/GMT-9">
        (GMT+09:00) Etc/GMT-9
      </option>
      <option offset="-540" value="Asia/Yakutsk">
        (GMT+09:00) Asia/Yakutsk
      </option>
      <option offset="-540" value="Asia/Tokyo">
        (GMT+09:00) Asia/Tokyo
      </option>
      <option offset="-540" value="Asia/Seoul">
        (GMT+09:00) Asia/Seoul
      </option>
      <option offset="-540" value="Asia/Pyongyang">
        (GMT+09:00) Asia/Pyongyang
      </option>
      <option offset="-540" value="Asia/Khandyga">
        (GMT+09:00) Asia/Khandyga
      </option>
      <option offset="-540" value="Asia/Jayapura">
        (GMT+09:00) Asia/Jayapura
      </option>
      <option offset="-540" value="Asia/Dili">
        (GMT+09:00) Asia/Dili
      </option>
      <option offset="-540" value="Asia/Chita">
        (GMT+09:00) Asia/Chita
      </option>
      <option offset="-570" value="Australia/North">
        (GMT+09:30) Australia/North
      </option>
      <option offset="-570" value="Australia/Darwin">
        (GMT+09:30) Australia/Darwin
      </option>
      <option offset="-600" value="Pacific/Yap">
        (GMT+10:00) Pacific/Yap
      </option>
      <option offset="-600" value="Pacific/Truk">
        (GMT+10:00) Pacific/Truk
      </option>
      <option offset="-600" value="Pacific/Saipan">
        (GMT+10:00) Pacific/Saipan
      </option>
      <option offset="-600" value="Pacific/Port_Moresby">
        (GMT+10:00) Pacific/Port_Moresby
      </option>
      <option offset="-600" value="Pacific/Guam">
        (GMT+10:00) Pacific/Guam
      </option>
      <option offset="-600" value="Pacific/Chuuk">
        (GMT+10:00) Pacific/Chuuk
      </option>
      <option offset="-600" value="Etc/GMT-10">
        (GMT+10:00) Etc/GMT-10
      </option>
      <option offset="-600" value="Australia/Queensland">
        (GMT+10:00) Australia/Queensland
      </option>
      <option offset="-600" value="Australia/Lindeman">
        (GMT+10:00) Australia/Lindeman
      </option>
      <option offset="-600" value="Australia/Brisbane">
        (GMT+10:00) Australia/Brisbane
      </option>
      <option offset="-600" value="Asia/Vladivostok">
        (GMT+10:00) Asia/Vladivostok
      </option>
      <option offset="-600" value="Asia/Ust-Nera">
        (GMT+10:00) Asia/Ust-Nera
      </option>
      <option offset="-600" value="Antarctica/DumontDUrville">
        (GMT+10:00) Antarctica/DumontDUrville
      </option>
      <option offset="-630" value="Australia/Yancowinna">
        (GMT+10:30) Australia/Yancowinna
      </option>
      <option offset="-630" value="Australia/South">
        (GMT+10:30) Australia/South
      </option>
      <option offset="-630" value="Australia/Broken_Hill">
        (GMT+10:30) Australia/Broken_Hill
      </option>
      <option offset="-630" value="Australia/Adelaide">
        (GMT+10:30) Australia/Adelaide
      </option>
      <option offset="-660" value="Pacific/Ponape">
        (GMT+11:00) Pacific/Ponape
      </option>
      <option offset="-660" value="Pacific/Pohnpei">
        (GMT+11:00) Pacific/Pohnpei
      </option>
      <option offset="-660" value="Pacific/Noumea">
        (GMT+11:00) Pacific/Noumea
      </option>
      <option offset="-660" value="Pacific/Kosrae">
        (GMT+11:00) Pacific/Kosrae
      </option>
      <option offset="-660" value="Pacific/Guadalcanal">
        (GMT+11:00) Pacific/Guadalcanal
      </option>
      <option offset="-660" value="Pacific/Efate">
        (GMT+11:00) Pacific/Efate
      </option>
      <option offset="-660" value="Pacific/Bougainville">
        (GMT+11:00) Pacific/Bougainville
      </option>
      <option offset="-660" value="Etc/GMT-11">
        (GMT+11:00) Etc/GMT-11
      </option>
      <option offset="-660" value="Australia/Victoria">
        (GMT+11:00) Australia/Victoria
      </option>
      <option offset="-660" value="Australia/Tasmania">
        (GMT+11:00) Australia/Tasmania
      </option>
      <option offset="-660" value="Australia/Sydney">
        (GMT+11:00) Australia/Sydney
      </option>
      <option offset="-660" value="Australia/NSW">
        (GMT+11:00) Australia/NSW
      </option>
      <option offset="-660" value="Australia/Melbourne">
        (GMT+11:00) Australia/Melbourne
      </option>
      <option offset="-660" value="Australia/Lord_Howe">
        (GMT+11:00) Australia/Lord_Howe
      </option>
      <option offset="-660" value="Australia/LHI">
        (GMT+11:00) Australia/LHI
      </option>
      <option offset="-660" value="Australia/Hobart">
        (GMT+11:00) Australia/Hobart
      </option>
      <option offset="-660" value="Australia/Currie">
        (GMT+11:00) Australia/Currie
      </option>
      <option offset="-660" value="Australia/Canberra">
        (GMT+11:00) Australia/Canberra
      </option>
      <option offset="-660" value="Australia/ACT">
        (GMT+11:00) Australia/ACT
      </option>
      <option offset="-660" value="Asia/Srednekolymsk">
        (GMT+11:00) Asia/Srednekolymsk
      </option>
      <option offset="-660" value="Asia/Sakhalin">
        (GMT+11:00) Asia/Sakhalin
      </option>
      <option offset="-660" value="Asia/Magadan">
        (GMT+11:00) Asia/Magadan
      </option>
      <option offset="-660" value="Antarctica/Macquarie">
        (GMT+11:00) Antarctica/Macquarie
      </option>
      <option offset="-720" value="Pacific/Wallis">
        (GMT+12:00) Pacific/Wallis
      </option>
      <option offset="-720" value="Pacific/Wake">
        (GMT+12:00) Pacific/Wake
      </option>
      <option offset="-720" value="Pacific/Tarawa">
        (GMT+12:00) Pacific/Tarawa
      </option>
      <option offset="-720" value="Pacific/Norfolk">
        (GMT+12:00) Pacific/Norfolk
      </option>
      <option offset="-720" value="Pacific/Nauru">
        (GMT+12:00) Pacific/Nauru
      </option>
      <option offset="-720" value="Pacific/Majuro">
        (GMT+12:00) Pacific/Majuro
      </option>
      <option offset="-720" value="Pacific/Kwajalein">
        (GMT+12:00) Pacific/Kwajalein
      </option>
      <option offset="-720" value="Pacific/Funafuti">
        (GMT+12:00) Pacific/Funafuti
      </option>
      <option offset="-720" value="Pacific/Fiji">
        (GMT+12:00) Pacific/Fiji
      </option>
      <option offset="-720" value="Kwajalein">
        (GMT+12:00) Kwajalein
      </option>
      <option offset="-720" value="Etc/GMT-12">
        (GMT+12:00) Etc/GMT-12
      </option>
      <option offset="-720" value="Asia/Kamchatka">
        (GMT+12:00) Asia/Kamchatka
      </option>
      <option offset="-720" value="Asia/Anadyr">
        (GMT+12:00) Asia/Anadyr
      </option>
      <option offset="-780" value="Pacific/Tongatapu">
        (GMT+13:00) Pacific/Tongatapu
      </option>
      <option offset="-780" value="Pacific/Kanton">
        (GMT+13:00) Pacific/Kanton
      </option>
      <option offset="-780" value="Pacific/Fakaofo">
        (GMT+13:00) Pacific/Fakaofo
      </option>
      <option offset="-780" value="Pacific/Enderbury">
        (GMT+13:00) Pacific/Enderbury
      </option>
      <option offset="-780" value="Pacific/Auckland">
        (GMT+13:00) Pacific/Auckland
      </option>
      <option offset="-780" value="Pacific/Apia">
        (GMT+13:00) Pacific/Apia
      </option>
      <option offset="-780" value="NZ">
        (GMT+13:00) NZ
      </option>
      <option offset="-780" value="Etc/GMT-13">
        (GMT+13:00) Etc/GMT-13
      </option>
      <option offset="-780" value="Antarctica/South_Pole">
        (GMT+13:00) Antarctica/South_Pole
      </option>
      <option offset="-780" value="Antarctica/McMurdo">
        (GMT+13:00) Antarctica/McMurdo
      </option>
      <option offset="-825" value="Pacific/Chatham">
        (GMT+13:45) Pacific/Chatham
      </option>
      <option offset="-825" value="NZ-CHAT">
        (GMT+13:45) NZ-CHAT
      </option>
      <option offset="-840" value="Pacific/Kiritimati">
        (GMT+14:00) Pacific/Kiritimati
      </option>
      <option offset="-840" value="Etc/GMT-14">
        (GMT+14:00) Etc/GMT-14
      </option>
    </select>
  );
}
