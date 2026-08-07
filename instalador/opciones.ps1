# ============================================================
# GamificApp — Las dos opciones que el usuario puede activar y desactivar
# cuando quiera:
#
#   1. ACCESO DESDE OTROS DISPOSITIVOS (red local)
#      Este equipo hace de servidor y las tablets/portatiles del aula entran
#      por navegador, sin instalar nada. Implica tres cosas:
#        · Vite escucha en todas las interfaces de red, no solo en localhost.
#        · CORS_ORIGIN incluye la IP de este equipo, y se REVISA EN CADA
#          ARRANQUE por si el router repartio otra distinta.
#        · Hay una regla de firewall que deja entrar a los puertos 3001 y 5173
#          SOLO en redes privadas o de dominio (jamas en redes publicas).
#
#   2. ARRANQUE AUTOMATICO
#      Una tarea programada que inicia GamificApp al iniciar sesion en Windows.
#
# Este archivo NO se ejecuta solo: lo cargan (dot-source) instalar.ps1,
# iniciar.ps1 y configurar.ps1. Requiere comun.ps1 cargado antes.
#
# Reglas que respeta:
#   · Nada se activa por inercia: las dos opciones nacen APAGADAS.
#   · Sin permisos de administrador para lo esencial. Solo la regla de
#     firewall los necesita, y si no los hay se explica el comando exacto en
#     vez de fallar en silencio.
#   · No se toca ningun servicio de Windows, ni el registro, ni el PATH.
#   · Un CORS_ORIGIN que el usuario haya escrito a mano NO se pisa.
# ============================================================

# ---- Estado permanente -------------------------------------------------
# Vive junto a instancia.json, en %LOCALAPPDATA%\GamificApp\: fuera del
# proyecto a proposito, para que la eleccion sobreviva a reinstalar, a mover
# la carpeta y a reemplazarla por una version nueva.
#
# Solo guarda la opcion de RED LOCAL. El arranque automatico no se apunta
# aqui: su fuente de verdad es la propia tarea programada de Windows, asi que
# si alguien la borra desde el Programador de tareas, GamificApp lo refleja en
# vez de mentir.
$script:ArchivoPreferencias = Join-Path (Join-Path $env:LOCALAPPDATA 'GamificApp') 'preferencias.json'
$script:PreferenciasVersionFormato = 1

$script:NombreReglaFirewall = 'GamificApp (red local)'
$script:NombreTareaArranque = 'GamificApp - Arranque automatico'
# Retraso tras iniciar sesion. No es un numero al azar: al arrancar Windows la
# tarjeta de red todavia esta negociando la IP con el router, y GamificApp
# necesita conocerla para escribir CORS_ORIGIN.
$script:RetrasoArranque = 'PT30S'

function Leer-Preferencias {
    $vacias = [pscustomobject]@{
        version    = $script:PreferenciasVersionFormato
        redLocal   = $false
        preguntado = $false
    }
    if (-not (Test-Path $script:ArchivoPreferencias)) { return $vacias }
    try {
        $datos = Get-Content -Path $script:ArchivoPreferencias -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -eq $datos.redLocal) { return $vacias }
        if ($null -eq $datos.preguntado) {
            $datos | Add-Member -NotePropertyName 'preguntado' -NotePropertyValue $false -Force
        }
        return $datos
    } catch { return $vacias }
}

# Escribe conservando lo que no se indique: asi guardar una cosa no borra la
# otra por descuido.
function Guardar-Preferencias {
    param(
        [Nullable[bool]]$RedLocal = $null,
        [Nullable[bool]]$Preguntado = $null
    )
    $previas = Leer-Preferencias
    $carpeta = Split-Path -Parent $script:ArchivoPreferencias
    if (-not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta -Force | Out-Null }
    $datos = [pscustomobject]@{
        version     = $script:PreferenciasVersionFormato
        redLocal    = $(if ($null -ne $RedLocal)   { [bool]$RedLocal }   else { [bool]$previas.redLocal })
        preguntado  = $(if ($null -ne $Preguntado) { [bool]$Preguntado } else { [bool]$previas.preguntado })
        actualizado = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    }
    $datos | ConvertTo-Json | Out-File -FilePath $script:ArchivoPreferencias -Encoding utf8
}

function Test-RedLocalActiva { return [bool](Leer-Preferencias).redLocal }

# ¿Ya se le preguntaron estas opciones a este usuario alguna vez? El
# instalador solo pregunta en la PRIMERA instalacion; a partir de ahi el sitio
# para cambiarlas es "Configurar GamificApp.cmd". Reinstalar no debe volver a
# interrogar a nadie por algo que ya decidio.
function Test-OpcionesPreguntadas { return [bool](Leer-Preferencias).preguntado }

# ---- Direccion de este equipo en la red --------------------------------
function Test-IPPrivada {
    param([string]$Ip)
    if ($Ip -match '^10\.')                     { return $true }
    if ($Ip -match '^192\.168\.')               { return $true }
    if ($Ip -match '^172\.(1[6-9]|2\d|3[01])\.'){ return $true }
    return $false
}

# La IP con la que el resto del aula ve a este equipo. Se busca por la ruta
# por defecto (la que lleva a internet) y no por "la primera que aparezca":
# un equipo con Docker, VPN o VirtualBox tiene varias IPv4 y casi ninguna
# sirve para que una tablet lo encuentre.
#
# Devuelve '' si no se puede determinar; quien llama debe contemplarlo.
function Obtener-IPLocal {
    try {
        $ruta = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
            Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } |
            Sort-Object -Property RouteMetric |
            Select-Object -First 1
        if ($ruta) {
            $ip = Get-NetIPAddress -InterfaceIndex $ruta.ifIndex -AddressFamily IPv4 -ErrorAction Stop |
                Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
                Select-Object -First 1
            if ($ip) { return $ip.IPAddress }
        }
    } catch { }

    # Respaldo: la primera IPv4 privada que no sea de loopback ni de las que
    # Windows se inventa cuando no hay DHCP (169.254.x.x).
    try {
        $candidatas = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' }
        foreach ($c in $candidatas) {
            if (Test-IPPrivada $c.IPAddress) { return $c.IPAddress }
        }
    } catch { }
    return ''
}

# La direccion que hay que dictar en el aula. Si la red local esta apagada o
# no se pudo averiguar la IP, se cae a localhost: nunca se anuncia una
# direccion que no vaya a funcionar.
function Obtener-UrlDeAcceso {
    param([string]$Ip = '')
    if (-not (Test-RedLocalActiva)) { return $script:UrlFrontend }
    # Ojo: un parametro [string] con valor por defecto $null llega como cadena
    # VACIA, nunca como $null. Comprobarlo con -eq $null hacia que llamar a esta
    # funcion sin -Ip devolviera siempre localhost en vez de averiguar la IP.
    if (-not $Ip) { $Ip = Obtener-IPLocal }
    if (-not $Ip) { return $script:UrlFrontend }
    return "http://${Ip}:$($script:PuertoFrontend)"
}

# ---- CORS: mantener server\.env al dia ---------------------------------
# El servidor solo acepta peticiones de los origenes que lista CORS_ORIGIN
# (server.js). Con la red local encendida hay que anadir la IP de HOY, que
# puede no ser la de ayer si el router reparte por DHCP.
#
# Solo se reescribe si el valor actual esta compuesto EXCLUSIVAMENTE por
# origenes que reconocemos (localhost:5173 y una IPv4:5173). Si el usuario
# metio ahi otra cosa a mano, se respeta y se avisa: su configuracion vale
# mas que nuestra automatizacion.
function Test-CorsGestionable {
    param([string]$Valor)
    if (-not $Valor) { return $true }
    foreach ($origen in ($Valor -split ',')) {
        $o = $origen.Trim().TrimEnd('/')
        if ($o -eq '') { continue }
        if ($o -eq $script:UrlFrontend) { continue }
        if ($o -match "^http://(\d{1,3}\.){3}\d{1,3}:$($script:PuertoFrontend)$") { continue }
        return $false
    }
    return $true
}

# Devuelve: 'sin-cambios' | 'actualizado' | 'ajeno' | 'sin-env'
function Sincronizar-CorsOrigin {
    param([string]$Ip)

    if (-not (Test-Path $script:ArchivoEnv)) { return 'sin-env' }
    $configuracion = Leer-Env $script:ArchivoEnv
    $actual = $configuracion['CORS_ORIGIN']

    if (-not (Test-CorsGestionable $actual)) { return 'ajeno' }

    # localhost SIEMPRE se conserva: el propio equipo servidor tiene que poder
    # abrir la aplicacion aunque la red se caiga.
    $deseado = $script:UrlFrontend
    if ((Test-RedLocalActiva) -and $Ip) { $deseado = "$($script:UrlFrontend),http://${Ip}:$($script:PuertoFrontend)" }

    if ($actual -eq $deseado) { return 'sin-cambios' }
    Establecer-ClaveEnv -Ruta $script:ArchivoEnv -Clave 'CORS_ORIGIN' -Valor $deseado
    return 'actualizado'
}

# ---- El .env de la raiz (el del frontend) ------------------------------
# Es distinto del de server\: este solo lo lee Vite AL CONSTRUIR, y lo que
# diga queda HORNEADO dentro de dist\.
#
# src/services/apiBase.js deduce la direccion de la API del origen desde el
# que se abrio la pagina, pero solo cuando VITE_API_URL NO esta definida. Si
# esta puesta a localhost, gana ella y vuelve el problema que resolvimos: la
# tablet pediria la API a su propio localhost.
#
# En el paquete que se distribuye este archivo NI SIQUIERA VIAJA (ver
# empaquetar.ps1), asi que esto solo afecta a quien instala desde una copia
# del repositorio.
$script:ArchivoEnvFrontend = Join-Path $script:Raiz '.env'

# Devuelve: 'no-existe' | 'sin-clave' | 'neutralizado' | 'ajeno'
function Revisar-EnvFrontend {
    if (-not (Test-Path $script:ArchivoEnvFrontend)) { return 'no-existe' }
    $valor = (Leer-Env $script:ArchivoEnvFrontend)['VITE_API_URL']
    if (-not $valor) { return 'sin-clave' }

    # Solo se neutraliza el valor que es EXACTAMENTE equivalente a lo que
    # apiBase.js deduce solo cuando se abre en este equipo. Una direccion de
    # verdad (un despliegue en Render, por ejemplo) es una decision del
    # usuario y no se toca jamas.
    if ($valor -notmatch '^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$') { return 'ajeno' }

    $texto = [System.IO.File]::ReadAllText($script:ArchivoEnvFrontend)
    $texto = $texto -replace '(?m)^\s*VITE_API_URL\s*=.*$', @'
# VITE_API_URL lo comento el instalador al activar el acceso desde otros
# dispositivos: con un valor fijo aqui, la direccion de la API queda horneada
# en dist\ y los demas dispositivos no pueden usarla. Vacia, src/services/
# apiBase.js la deduce sola del origen. Descomentala solo para apuntar a un
# servidor REMOTO.
# VITE_API_URL=
'@
    Escribir-TextoSinBom -Ruta $script:ArchivoEnvFrontend -Contenido $texto
    return 'neutralizado'
}

# ---- Firewall de Windows -----------------------------------------------
function Test-Administrador {
    try {
        $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Test-ReglaFirewall {
    try {
        $regla = Get-NetFirewallRule -DisplayName $script:NombreReglaFirewall -ErrorAction Stop
        return [bool]$regla
    } catch { return $false }
}

# El comando exacto que hay que pegar en un PowerShell de administrador si
# aqui no tenemos permisos. Se muestra tal cual: nada de "pide ayuda a
# alguien de sistemas".
function Obtener-ComandoFirewall {
    return "New-NetFirewallRule -DisplayName '$($script:NombreReglaFirewall)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $($script:PuertoBackend),$($script:PuertoFrontend) -Profile Private,Domain"
}

# Devuelve: 'ya-existia' | 'creada' | 'sin-permisos' | 'error: <detalle>'
function Asegurar-ReglaFirewall {
    if (Test-ReglaFirewall) { return 'ya-existia' }
    if (-not (Test-Administrador)) { return 'sin-permisos' }
    try {
        # Private,Domain y NUNCA Public: en la wifi de una cafeteria o de un
        # aeropuerto GamificApp seguira siendo invisible desde fuera.
        New-NetFirewallRule -DisplayName $script:NombreReglaFirewall `
            -Description 'Permite que otros dispositivos de la red local abran GamificApp.' `
            -Direction Inbound -Action Allow -Protocol TCP `
            -LocalPort $script:PuertoBackend, $script:PuertoFrontend `
            -Profile Private, Domain -ErrorAction Stop | Out-Null
        return 'creada'
    } catch {
        return "error: $($_.Exception.Message)"
    }
}

# Devuelve: 'no-estaba' | 'quitada' | 'sin-permisos' | 'error: <detalle>'
function Quitar-ReglaFirewall {
    if (-not (Test-ReglaFirewall)) { return 'no-estaba' }
    if (-not (Test-Administrador)) { return 'sin-permisos' }
    try {
        Remove-NetFirewallRule -DisplayName $script:NombreReglaFirewall -ErrorAction Stop
        return 'quitada'
    } catch {
        return "error: $($_.Exception.Message)"
    }
}

# ---- Arranque automatico (tarea programada) ----------------------------
# Se usa una tarea "al iniciar sesion de ESTE usuario", no "al iniciar el
# sistema", por dos razones que no son de estilo:
#
#   · Registrarla no pide permisos de administrador; la de sistema si.
#   · La de sistema correria como SYSTEM, y entonces %LOCALAPPDATA% seria
#     otra carpeta: MySQL arrancaria contra un datadir vacio y pareceria que
#     se perdio todo el trabajo de la escuela.
function Obtener-TareaArranque {
    try { return Get-ScheduledTask -TaskName $script:NombreTareaArranque -ErrorAction Stop }
    catch { return $null }
}

function Test-ArranqueAutomaticoActivo { return [bool](Obtener-TareaArranque) }

function Obtener-RutaIniciarPs1 { return (Join-Path $PSScriptRoot 'iniciar.ps1') }

# ¿La tarea registrada apunta a ESTA copia de GamificApp? Si el usuario movio
# o duplico la carpeta, la tarea puede estar apuntando a la de antes y fallar
# cada arranque sin decir nada.
function Test-TareaApuntaAqui {
    $tarea = Obtener-TareaArranque
    if (-not $tarea) { return $false }
    $ruta = Obtener-RutaIniciarPs1
    foreach ($accion in $tarea.Actions) {
        if ($accion.Arguments -and $accion.Arguments.IndexOf($ruta, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }
    return $false
}

# Devuelve: 'registrada' | 'error: <detalle>'
function Registrar-TareaArranque {
    $rutaIniciar = Obtener-RutaIniciarPs1
    if (-not (Test-Path $rutaIniciar)) { return 'error: no se encuentra iniciar.ps1' }

    # Se invoca el .ps1, NUNCA el .cmd: "Iniciar GamificApp.cmd" termina en
    # `pause`, y una tarea programada que espera una tecla se queda colgada
    # para siempre.
    #
    # -SinNavegador: en un arranque automatico nadie ha pedido que se abra el
    # navegador. La direccion del aula se consulta en "Configurar
    # GamificApp.cmd" o en CREDENCIALES.txt.
    $usuario = "$env:USERDOMAIN\$env:USERNAME"
    try {
        $accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
            -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$rutaIniciar`" -SinNavegador"

        $disparador = New-ScheduledTaskTrigger -AtLogOn -User $usuario
        $disparador.Delay = $script:RetrasoArranque

        # StartWhenAvailable: si el equipo estaba apagado a la hora prevista,
        # se ejecuta en cuanto se pueda en vez de saltarse el turno.
        $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit (New-TimeSpan -Hours 1)

        # RunLevel Limited: los permisos normales del usuario, ni uno mas.
        $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

        Register-ScheduledTask -TaskName $script:NombreTareaArranque `
            -Action $accion -Trigger $disparador -Settings $ajustes -Principal $principal `
            -Description 'Inicia GamificApp al iniciar sesion en Windows. Creado por "Configurar GamificApp.cmd"; se puede quitar desde ahi mismo.' `
            -Force -ErrorAction Stop | Out-Null
        return 'registrada'
    } catch {
        return "error: $($_.Exception.Message)"
    }
}

# Devuelve: 'no-estaba' | 'quitada' | 'error: <detalle>'
function Quitar-TareaArranque {
    if (-not (Obtener-TareaArranque)) { return 'no-estaba' }
    try {
        Unregister-ScheduledTask -TaskName $script:NombreTareaArranque -Confirm:$false -ErrorAction Stop
        return 'quitada'
    } catch {
        return "error: $($_.Exception.Message)"
    }
}

# ---- Aplicar la opcion de red local -------------------------------------
# Un unico sitio donde se enciende o se apaga todo lo de la red local, para
# que instalar.ps1 y configurar.ps1 no puedan divergir.
#
# Devuelve un objeto con lo que hizo, para que quien llama lo cuente en
# pantalla como prefiera.
function Aplicar-RedLocal {
    param([bool]$Activar)

    Guardar-Preferencias -RedLocal $Activar

    $ip = ''
    if ($Activar) { $ip = Obtener-IPLocal }
    $cors = Sincronizar-CorsOrigin -Ip $ip

    $firewall = 'omitido'
    if ($Activar) { $firewall = Asegurar-ReglaFirewall }

    return [pscustomobject]@{
        Activa   = $Activar
        Ip       = $ip
        Cors     = $cors
        Firewall = $firewall
        Url      = (Obtener-UrlDeAcceso -Ip $ip)
    }
}

# Mensajes compartidos: los usan tanto el instalador como el configurador, y
# asi dicen exactamente lo mismo en los dos sitios.
function Mostrar-ResultadoRedLocal {
    param([pscustomobject]$Resultado)

    if (-not $Resultado.Activa) {
        Escribir-Ok 'Acceso desde otros dispositivos: DESACTIVADO.'
        Escribir-Detalle "GamificApp solo se abre en este equipo, en $($script:UrlFrontend)."
        return
    }

    if (-not $Resultado.Ip) {
        Escribir-Aviso 'No se pudo averiguar la direccion de este equipo en la red.'
        Escribir-Detalle 'Comprueba que esta conectado al wifi o al cable de red y vuelve a intentarlo.'
    } else {
        Escribir-Ok "Acceso desde otros dispositivos: ACTIVADO en $($Resultado.Url)"
    }

    switch ($Resultado.Cors) {
        'actualizado' { Escribir-Detalle 'server/.env actualizado: el servidor ya acepta esa direccion.' }
        'sin-cambios' { Escribir-Detalle 'server/.env ya estaba al dia.' }
        'ajeno'       { Escribir-Aviso  'CORS_ORIGIN tiene valores escritos a mano: se respeta y NO se toca. Anade ahi la direccion de red si hace falta.' }
        'sin-env'     { Escribir-Aviso  'Todavia no existe server/.env: se ajustara al instalar.' }
    }

    switch -Wildcard ($Resultado.Firewall) {
        'creada'       { Escribir-Detalle 'Regla de firewall creada (solo redes privadas o de dominio; nunca publicas).' }
        'ya-existia'   { Escribir-Detalle 'La regla de firewall ya estaba puesta.' }
        'sin-permisos' {
            Escribir-Aviso 'Falta abrir el firewall de Windows, y eso SI necesita permisos de administrador.'
            Escribir-Detalle 'Abre PowerShell como administrador, pega esta linea y pulsa Enter:'
            Write-Host ''
            Write-Host "     $(Obtener-ComandoFirewall)" -ForegroundColor Cyan
            Write-Host ''
            Escribir-Detalle 'Sin eso, los demas dispositivos no lograran conectarse.'
        }
        'error*'       { Escribir-Aviso "No se pudo crear la regla de firewall. $($Resultado.Firewall)" }
    }
}
