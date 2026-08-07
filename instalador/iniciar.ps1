# ============================================================
# GamificApp — Arranque diario.
# Punto de entrada real: "Iniciar GamificApp.cmd" (doble clic).
#
# No instala nada ni reconstruye la pagina: asume que ya se ejecuto una vez
# "Instalar GamificApp.cmd". Si detecta que la aplicacion ya esta en marcha,
# NO la duplica: solo abre el navegador.
#
# Parametros (no se usan en el doble clic):
#   -SinNavegador   no abre el navegador al terminar. Lo usa la tarea del
#                   arranque automatico: al encender el equipo nadie ha pedido
#                   que se abra una ventana.
# ============================================================
param([switch]$SinNavegador)

. (Join-Path $PSScriptRoot 'comun.ps1')
. (Join-Path $PSScriptRoot 'mysql.ps1')
. (Join-Path $PSScriptRoot 'opciones.ps1')

Iniciar-Registro 'iniciar'
Escribir-Titulo 'GamificApp — Iniciar'

# ------------------------------------------------------------
# 1. Requisitos minimos
# ------------------------------------------------------------
# Nota: este script NO carga runtime.ps1 a proposito. El arranque diario
# jamas debe depender de la red: si falta el runtime, manda a Instalar.
$node = Obtener-Node
if (-not $node -or -not (Test-NodeCompatible $node.Version)) {
    Terminar-Con-Error 'Node.js no esta disponible o no es compatible.' @(
        "GamificApp necesita $script:NodeRequisitoTexto.",
        'Ejecuta "Instalar GamificApp.cmd": si hace falta, descarga una copia',
        'portable sin instalar nada en el sistema.'
    )
}

$faltantes = @()
if (-not (Test-Path $script:ArchivoEnv))                                    { $faltantes += 'la configuracion (server/.env)' }
if (-not (Test-Path (Join-Path $script:CarpetaServer 'node_modules')))      { $faltantes += 'las dependencias del servidor' }
if (-not (Test-Path (Join-Path $script:Raiz 'node_modules')))               { $faltantes += 'las dependencias de la pagina web' }
if (-not (Test-Path (Join-Path $script:Raiz 'dist\index.html')))            { $faltantes += 'la pagina web construida (dist)' }
if ($faltantes.Count -gt 0) {
    Terminar-Con-Error 'La aplicacion todavia no esta instalada.' @(
        "Falta: $($faltantes -join ', ').",
        '',
        'Que hacer:',
        '  Ejecuta primero "Instalar GamificApp.cmd" (doble clic).'
    )
}
$origenNode = $(if ($node.Origen -eq 'portable') { 'portable' } else { 'del equipo' })
Escribir-Ok "Node.js $($node.Texto) ($origenNode) y la instalacion previa estan en orden."
Escribir-Detalle $node.Ruta

# ------------------------------------------------------------
# 2. MySQL en marcha  (SIEMPRE lo primero: sin base de datos no tiene
#    sentido levantar el servidor ni la pagina web)
# ------------------------------------------------------------
$configuracion = Leer-Env $script:ArchivoEnv
$servidorBd = $configuracion['DB_HOST']; if (-not $servidorBd) { $servidorBd = 'localhost' }
$puertoBd   = $configuracion['DB_PORT']; if (-not $puertoBd)   { $puertoBd = '3306' }
if ($configuracion['DB_PASSWORD']) { Registrar-Secreto $configuracion['DB_PASSWORD'] }
if ($configuracion['JWT_SECRET'])  { Registrar-Secreto $configuracion['JWT_SECRET'] }
if ($configuracion['ADMIN_PASSWORD']) { Registrar-Secreto $configuracion['ADMIN_PASSWORD'] }

# Si la base es la portable de GamificApp, la encendemos nosotros. Si ya
# estaba en marcha, Asegurar-MySqlPortableEnMarcha lo detecta y NO lanza una
# segunda instancia.
$bdPortable = (Test-MySqlPortableDisponible) -and
              (Test-EnvEsInstanciaPortable -Servidor $servidorBd -Puerto ([int]$puertoBd))
if ($bdPortable) {
    Escribir-Paso 'Comprobando la base de datos de GamificApp'
    [void](Asegurar-MySqlPortableEnMarcha -Puerto ([int]$puertoBd))
}

if (-not (Test-PuertoTcpAbierto -Servidor $servidorBd -Puerto ([int]$puertoBd))) {
    if ($bdPortable) {
        Mostrar-DiagnosticoMySql
        Terminar-Con-Error "La base de datos de GamificApp no responde en ${servidorBd}:${puertoBd}." @(
            'Se intento iniciarla y no llego a responder, asi que NO se ha arrancado',
            'el resto de la aplicacion.',
            '',
            "Registro completo en: $script:MySqlErrorLog",
            '',
            'Que hacer:',
            '  1. Ejecuta "Detener GamificApp.cmd".',
            '  2. Vuelve a ejecutar este archivo.'
        )
    }
    Terminar-Con-Error "MySQL no responde en ${servidorBd}:${puertoBd}." @(
        'La base de datos esta apagada.',
        '',
        'Que hacer:',
        '  1. Abre "Servicios" de Windows (tecla Windows, escribe Servicios).',
        '  2. Busca MySQL80 (o el nombre de tu instalacion) y pulsa Iniciar.',
        '  3. Vuelve a ejecutar este archivo.'
    )
}
Escribir-Ok "MySQL responde en ${servidorBd}:${puertoBd}."

# ------------------------------------------------------------
# 2-bis. Acceso desde otros dispositivos (si esta activado)
# ------------------------------------------------------------
# Va ANTES del servidor a proposito: el backend lee CORS_ORIGIN de server/.env
# una sola vez, al arrancar. Si la IP de este equipo cambio desde ayer —cosa
# normal cuando el router reparte por DHCP— hay que dejarla escrita antes de
# encenderlo, o rechazaria a todas las tablets del aula.
$modoRed = Test-RedLocalActiva
$ipLocal = ''
$corsCambio = $false
if ($modoRed) {
    Escribir-Paso 'Comprobando el acceso desde otros dispositivos'
    $ipLocal = Obtener-IPLocal
    if (-not $ipLocal) {
        Escribir-Aviso 'No se pudo averiguar la direccion de este equipo en la red.'
        Escribir-Detalle 'GamificApp arrancara igual, pero solo se podra abrir en este equipo.'
    } else {
        $resultadoCors = Sincronizar-CorsOrigin -Ip $ipLocal
        $corsCambio = ($resultadoCors -eq 'actualizado')
        if ($corsCambio) {
            Escribir-Ok "La direccion de este equipo es ahora ${ipLocal}: server/.env actualizado."
        } else {
            Escribir-Ok "Direccion de este equipo en la red: $ipLocal"
        }
        if ($resultadoCors -eq 'ajeno') {
            Escribir-Aviso 'CORS_ORIGIN esta escrito a mano en server/.env: se respeta y no se toca.'
        }
        if (-not (Test-ReglaFirewall)) {
            Escribir-Aviso 'El firewall de Windows no tiene la regla de GamificApp: los demas dispositivos no podran entrar.'
            Escribir-Detalle 'Ejecuta "Configurar GamificApp.cmd" para ver como abrirlo.'
        }
    }
}

# CREDENCIALES.txt es el papel al que vuelve el docente, asi que tiene que
# llevar la direccion de HOY y no la del dia que se instalo. Va fuera del
# if de arriba a proposito: con la red apagada esto RETIRA el bloque, para que
# nadie dicte una direccion que ya no atiende a nadie.
$credenciales = Actualizar-CredencialesConRed -Ip $ipLocal
switch -Wildcard ($credenciales) {
    'actualizado' { Escribir-Detalle 'CREDENCIALES.txt actualizado con la direccion de hoy.' }
    'retirado'    { Escribir-Detalle 'CREDENCIALES.txt ya no anuncia una direccion de red.' }
    'bloqueado'   {
        Escribir-Aviso 'CREDENCIALES.txt esta abierto en otro programa: no se pudo poner al dia.'
        Escribir-Detalle 'Cierralo y vuelve a iniciar. La direccion correcta es la que sale aqui abajo.'
    }
    'error*'      { Escribir-Aviso "No se pudo actualizar CREDENCIALES.txt. $credenciales" }
}

# ------------------------------------------------------------
# 3. Servidor (backend)
# ------------------------------------------------------------
Escribir-Paso 'Comprobando el servidor de GamificApp'
$estadoBackend = Obtener-EstadoServicio -Nombre 'backend' -Puerto $script:PuertoBackend -UrlSalud "$($script:UrlBackend)/api/health"

# Un servidor ya en marcha sigue teniendo en memoria el CORS_ORIGIN viejo: si
# la direccion cambio, hay que reiniciarlo o seguira rechazando al aula.
if ($corsCambio -and $estadoBackend.Vivo) {
    Escribir-Detalle 'La direccion de red cambio: se reinicia el servidor para que la tome.'
    [void](Detener-Servicio 'backend')
    $estadoBackend = Obtener-EstadoServicio -Nombre 'backend' -Puerto $script:PuertoBackend -UrlSalud "$($script:UrlBackend)/api/health"
}

if ($estadoBackend.Vivo -and $estadoBackend.Responde) {
    Escribir-Ok "Ya estaba en marcha (PID $($estadoBackend.ProcesoId)). No se inicia otra vez."
} elseif ($estadoBackend.Vivo -and -not $estadoBackend.Responde) {
    $espera = Esperar-Respuesta -Url "$($script:UrlBackend)/api/health" -SegundosMax 20
    if (-not $espera.Ok) {
        Terminar-Con-Error 'El servidor esta iniciado pero no responde.' @(
            "Proceso PID $($estadoBackend.ProcesoId) vivo, sin respuesta en $($script:UrlBackend)/api/health.",
            '',
            'Que hacer:',
            '  1. Ejecuta "Detener GamificApp.cmd".',
            '  2. Vuelve a ejecutar este archivo.'
        )
    }
    Escribir-Ok 'Ya estaba en marcha y ahora responde.'
} else {
    # El puerto podria estar ocupado por un programa ajeno.
    if ($estadoBackend.DuenoPuerto) {
        Terminar-Con-Error "El puerto $($script:PuertoBackend) lo esta usando otro programa." @(
            "Lo ocupa: $($estadoBackend.DuenoPuerto.Nombre) (PID $($estadoBackend.DuenoPuerto.ProcesoId))",
            '',
            'Que hacer:',
            '  1. Cierra ese programa.',
            '  2. Vuelve a ejecutar este archivo.'
        )
    }
    $procesoBackend = Iniciar-Backend
    Escribir-Detalle "Servidor iniciado (PID $($procesoBackend.Id)). Esperando a que responda..."
    $salud = Esperar-Respuesta -Url "$($script:UrlBackend)/api/health" -SegundosMax 60 -Proceso $procesoBackend
    if (-not $salud.Ok) {
        Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'backend-errores.log') -Lineas 15
        [void](Detener-Servicio 'backend')
        Terminar-Con-Error 'El servidor no llego a responder.' @(
            $salud.Motivo,
            '',
            "Detalle en: $(Join-Path $script:CarpetaLogs 'backend-errores.log')"
        )
    }
    Escribir-Ok 'El servidor responde (/api/health).'
}

# Comprobacion con base de datos incluida.
$saludBd = Esperar-Respuesta -Url "$($script:UrlBackend)/api/institucion" -SegundosMax 30
if (-not $saludBd.Ok) {
    Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'backend-errores.log') -Lineas 15
    Terminar-Con-Error 'El servidor no puede leer la base de datos.' @(
        $saludBd.Motivo,
        '',
        'Comprueba que MySQL sigue en marcha.'
    )
}
Escribir-Ok 'La base de datos responde.'

# El servidor escucha antes de terminar sus migraciones: confirmamos que el
# esquema esta realmente completo antes de dar el arranque por bueno.
$esquema = Invocar-ScriptBD -Script 'bd-verificar.mjs' -Variables @{
    GA_DB_HOST          = $servidorBd
    GA_DB_PORT          = "$puertoBd"
    GA_DB_USER          = $(if ($configuracion['DB_USER']) { $configuracion['DB_USER'] } else { 'root' })
    GA_DB_PASSWORD      = $(if ($configuracion['DB_PASSWORD']) { $configuracion['DB_PASSWORD'] } else { '' })
    GA_DB_NAME          = $(if ($configuracion['DB_NAME']) { $configuracion['DB_NAME'] } else { $script:BaseDatosPredeterminada })
    GA_ESPERAR_TABLAS   = $script:TablasDeMigraciones
    GA_ESPERAR_ADMIN    = '1'
    GA_ESPERAR_SEGUNDOS = '60'
}
if (-not $esquema -or -not $esquema.ok) {
    Terminar-Con-Error 'La base de datos no esta lista.' @(
        'El servidor responde, pero el esquema de la base de datos esta incompleto.',
        '',
        'Que hacer:',
        '  Ejecuta "Instalar GamificApp.cmd" para reparar la instalacion.'
    )
}
Escribir-Ok "Esquema completo: $($esquema.tablas) tablas."

# ------------------------------------------------------------
# 4. Pagina web (frontend)
# ------------------------------------------------------------
Escribir-Paso 'Comprobando la pagina web'
$estadoFrontend = Obtener-EstadoServicio -Nombre 'frontend' -Puerto $script:PuertoFrontend -UrlSalud $script:UrlFrontend

# Vite decide en que interfaces escucha al arrancar y no lo cambia despues.
# Si la pagina lleva viva desde antes de que se activara (o desactivara) el
# acceso desde otros dispositivos, esta sirviendo el modo equivocado: se
# reinicia. Se compara contra lo que quedo apuntado al lanzarla, no contra una
# suposicion.
$registroFrontend = Leer-Proceso 'frontend'
if ($estadoFrontend.Vivo -and $registroFrontend -and ([bool]$registroFrontend.red) -ne $modoRed) {
    $haciaDonde = $(if ($modoRed) { 'para toda la red' } else { 'solo para este equipo' })
    Escribir-Detalle "La pagina web estaba sirviendo en otro modo: se reinicia $haciaDonde."
    [void](Detener-Servicio 'frontend')
    $estadoFrontend = Obtener-EstadoServicio -Nombre 'frontend' -Puerto $script:PuertoFrontend -UrlSalud $script:UrlFrontend
}

if ($estadoFrontend.Vivo -and $estadoFrontend.Responde) {
    Escribir-Ok "Ya estaba en marcha (PID $($estadoFrontend.ProcesoId)). No se inicia otra vez."
} else {
    if (-not $estadoFrontend.Vivo -and $estadoFrontend.DuenoPuerto) {
        Terminar-Con-Error "El puerto $($script:PuertoFrontend) lo esta usando otro programa." @(
            "Lo ocupa: $($estadoFrontend.DuenoPuerto.Nombre) (PID $($estadoFrontend.DuenoPuerto.ProcesoId))",
            '',
            'GamificApp necesita ese puerto exacto: si la pagina se abriera en otro,',
            'el servidor rechazaria sus peticiones por seguridad (CORS).',
            '',
            'Que hacer:',
            '  1. Cierra ese programa.',
            '  2. Vuelve a ejecutar este archivo.'
        )
    }
    if ($estadoFrontend.Vivo) {
        $espera = Esperar-Respuesta -Url $script:UrlFrontend -SegundosMax 20
        if ($espera.Ok) {
            Escribir-Ok 'Ya estaba en marcha y ahora responde.'
        } else {
            Terminar-Con-Error 'La pagina web esta iniciada pero no responde.' @(
                'Ejecuta "Detener GamificApp.cmd" y vuelve a intentarlo.'
            )
        }
    } else {
        $procesoFrontend = Iniciar-Frontend -EscucharEnRed:$modoRed
        Escribir-Detalle "Pagina web iniciada (PID $($procesoFrontend.Id)). Esperando a que responda..."
        $saludWeb = Esperar-Respuesta -Url $script:UrlFrontend -SegundosMax 60 -Proceso $procesoFrontend
        if (-not $saludWeb.Ok) {
            Mostrar-ColaLog -Ruta (Join-Path $script:CarpetaLogs 'frontend-errores.log') -Lineas 15
            [void](Detener-Servicio 'frontend')
            Terminar-Con-Error 'La pagina web no llego a responder.' @(
                $saludWeb.Motivo,
                '',
                "Detalle en: $(Join-Path $script:CarpetaLogs 'frontend-errores.log')"
            )
        }
        Escribir-Ok "La pagina web responde en $($script:UrlFrontend)."
    }
}

# ------------------------------------------------------------
# 5. Abrir el navegador
# ------------------------------------------------------------
# La direccion del aula es la de HOY: se acaba de medir unas lineas mas
# arriba. Aunque el router haya dado otra IP esta manana, lo que se abre y lo
# que se imprime es lo correcto, sin reconstruir nada ni tocar la
# configuracion del router.
$urlAcceso = Obtener-UrlDeAcceso -Ip $ipLocal
if (-not $SinNavegador) {
    # Se abre la del aula para tenerla delante en la barra de direcciones.
    # Elegir-UrlParaNavegador la prueba primero: si no responde (VPN, adaptador
    # virtual, router que aun no ha dado IP) se abre localhost y se dice.
    $urlNavegador = Elegir-UrlParaNavegador -UrlDeRed $urlAcceso
    if ($urlAcceso -ne $script:UrlFrontend -and $urlNavegador -eq $script:UrlFrontend) {
        Escribir-Aviso "La direccion de red no respondio: se abre $($script:UrlFrontend)."
    }
    Abrir-Navegador -Url $urlNavegador
}

Write-Host ''
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   GAMIFICAPP ESTA EN MARCHA" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
if ($modoRed -and $ipLocal) {
    # Primero la del aula: es la unica que sirve fuera de este equipo.
    Write-Host "   Para tablets, telefonos y otros equipos:" -ForegroundColor White
    Write-Host "       $urlAcceso" -ForegroundColor Cyan
    Write-Host "   (puede cambiar de un dia a otro; siempre es la que sale aqui)" -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "   Solo en ESTE equipo:  $($script:UrlFrontend)" -ForegroundColor White
    Write-Host "   (no la compartas: en otro aparato, localhost es ese aparato)" -ForegroundColor DarkGray
    if (-not (Test-ReglaFirewall)) {
        Write-Host ''
        Write-Host "   FALTA abrir el firewall: hasta entonces los demas dispositivos" -ForegroundColor Yellow
        Write-Host "   NO entraran, ni con la direccion correcta." -ForegroundColor Yellow
        Write-Host '   Ejecuta "Configurar GamificApp.cmd" y te da el comando exacto.' -ForegroundColor Yellow
    }
} else {
    Write-Host "   En este equipo:  $($script:UrlFrontend)" -ForegroundColor White
}
Write-Host ''
Write-Host "   Tus credenciales estan en CREDENCIALES.txt" -ForegroundColor White
Write-Host "   Para cerrarla: Detener GamificApp.cmd" -ForegroundColor White
Write-Host ''
Escribir-Log "Arranque completado. Direccion de acceso: $urlAcceso" 'OK' $false
exit 0
