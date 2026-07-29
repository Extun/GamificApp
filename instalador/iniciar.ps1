# ============================================================
# GamificApp — Arranque diario.
# Punto de entrada real: "Iniciar GamificApp.cmd" (doble clic).
#
# No instala nada ni reconstruye la pagina: asume que ya se ejecuto una vez
# "Instalar GamificApp.cmd". Si detecta que la aplicacion ya esta en marcha,
# NO la duplica: solo abre el navegador.
# ============================================================
. (Join-Path $PSScriptRoot 'comun.ps1')

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
# 2. MySQL en marcha
# ------------------------------------------------------------
$configuracion = Leer-Env $script:ArchivoEnv
$servidorBd = $configuracion['DB_HOST']; if (-not $servidorBd) { $servidorBd = 'localhost' }
$puertoBd   = $configuracion['DB_PORT']; if (-not $puertoBd)   { $puertoBd = '3306' }
if ($configuracion['DB_PASSWORD']) { Registrar-Secreto $configuracion['DB_PASSWORD'] }
if ($configuracion['JWT_SECRET'])  { Registrar-Secreto $configuracion['JWT_SECRET'] }
if ($configuracion['ADMIN_PASSWORD']) { Registrar-Secreto $configuracion['ADMIN_PASSWORD'] }

if (-not (Test-PuertoTcpAbierto -Servidor $servidorBd -Puerto ([int]$puertoBd))) {
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
# 3. Servidor (backend)
# ------------------------------------------------------------
Escribir-Paso 'Comprobando el servidor de GamificApp'
$estadoBackend = Obtener-EstadoServicio -Nombre 'backend' -Puerto $script:PuertoBackend -UrlSalud "$($script:UrlBackend)/api/health"

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
        $procesoFrontend = Iniciar-Frontend
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
Abrir-Navegador -Url $script:UrlFrontend

Write-Host ''
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   GAMIFICAPP ESTA EN MARCHA" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Abrela en:  $($script:UrlFrontend)" -ForegroundColor White
Write-Host "   Tus credenciales estan en CREDENCIALES.txt" -ForegroundColor White
Write-Host "   Para cerrarla: Detener GamificApp.cmd" -ForegroundColor White
Write-Host ''
Escribir-Log 'Arranque completado.' 'OK' $false
exit 0
